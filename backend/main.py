import os
import sys
import time
import logging
import base64
import shutil
import tempfile
import io
from contextlib import asynccontextmanager
from typing import Dict, List, Any, Optional

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ultralytics import YOLO 
# ----------------------------------------------------
# Logging Configuration
# ----------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("ppe-backend")

# ----------------------------------------------------
# Model Path Resolution
# ----------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "model", "best.pt")

# ----------------------------------------------------
# Lifespan Context Manager (Startup & Shutdown)
# ----------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Asynchronous context manager to manage backend lifespan events.
    Loads the YOLOv8 model once during startup and cleans up on shutdown.
    """
    logger.info("Initializing FastAPI application lifecycle...")
    
    # Enable environment variables loading
    model_env_path = os.getenv("MODEL_PATH", MODEL_PATH)
    logger.info(f"Resolved model source path: {model_env_path}")
    
    try:
        if not os.path.exists(model_env_path):
            logger.error(f"Critical error: Model file not found at {model_env_path}")
            app.state.model = None
            app.state.classes = {}
        else:
            logger.info("Loading YOLOv8 PyTorch model into memory...")
            # Load Ultralytics YOLO model
            model = YOLO(model_env_path)
            
            # Cache model and metadata in application state for reuse
            app.state.model = model
            app.state.classes = model.names
            logger.info(f"YOLOv8 model loaded successfully. Total classes: {len(model.names)}")
            logger.info(f"Discovered classes: {model.names}")
    except Exception as e:
        logger.error(f"Failed to load the model during startup sequence: {e}", exc_info=True)
        app.state.model = None
        app.state.classes = {}

    yield
    
    logger.info("Shutdown sequence initiated. Cleaning up cached application resources.")
    app.state.model = None
    app.state.classes = {}

# ----------------------------------------------------
# FastAPI Application Initialization
# ----------------------------------------------------
app = FastAPI(
    title="PPE Safety Detection API",
    description=(
        "Production-grade FastAPI backend for detecting Personal Protective Equipment (PPE) "
        "using a fine-tuned YOLOv8 model. Supports image predictions, intelligently sampled "
        "video predictions, and real-time webcam frame-streaming via WebSockets."
    ),
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS Middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Set to actual domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# Pydantic Schemas for API Documentation
# ----------------------------------------------------
class HealthResponse(BaseModel):
    status: str = Field(..., description="Application health status", example="healthy")
    model_loaded: bool = Field(..., description="Indicates if the prediction model loaded successfully", example=True)

class ClassesResponse(BaseModel):
    classes: List[str] = Field(..., description="List of all available prediction classes", example=[
        "helmet", "gloves", "vest", "boots", "goggles", "none", "Person", "no_helmet", "no_goggle", "no_gloves", "no_boots"
    ])

class ModelInfoResponse(BaseModel):
    model_name: str = Field(..., description="Filename of the model being utilized", example="best.pt")
    model_type: str = Field(..., description="Framework/Architecture type", example="YOLOv8 Object Detection")
    num_classes: int = Field(..., description="Total number of supported classes", example=11)
    classes: List[str] = Field(..., description="All discovered prediction classes", example=[
        "helmet", "gloves", "vest", "boots", "goggles", "none", "Person", "no_helmet", "no_goggle", "no_gloves", "no_boots"
    ])

class DetectionItem(BaseModel):
    class_name: str = Field(..., description="The name of the detected class", example="helmet")
    confidence: float = Field(..., description="The confidence score of the detection", example=0.98)
    box: List[float] = Field(..., description="Bounding box coordinates in [xmin, ymin, xmax, ymax] format", example=[102.5, 45.0, 240.2, 190.5])

class PredictionResponse(BaseModel):
    predicted_class: str = Field(..., description="The detected class with the highest confidence score, or 'none'", example="helmet")
    confidence: float = Field(..., description="The confidence score of the predicted class (0.0 if 'none')", example=0.98)
    all_probabilities: Dict[str, float] = Field(
        ...,
        description="The maximum confidence score detected for each class in the frame (0.0 if not detected)",
        example={"helmet": 0.98, "gloves": 0.0, "vest": 0.85}
    )
    detections: List[DetectionItem] = Field(..., description="List of all separate object detections in the image")
    annotated_image: Optional[str] = Field(None, description="Base64 encoded JPEG image with bounding boxes drawn")

class FramePrediction(BaseModel):
    frame_index: int = Field(..., description="The frame number or index in the video stream", example=30)
    predicted_class: str = Field(..., description="The highest confidence class in this specific frame", example="helmet")
    confidence: float = Field(..., description="The confidence of the prediction in this frame", example=0.95)
    detections: List[DetectionItem] = Field(..., description="List of object detections in this specific frame")

class VideoPredictionResponse(BaseModel):
    predicted_class: str = Field(..., description="The aggregated prediction class across all frames", example="helmet")
    confidence: float = Field(..., description="The aggregated average or maximum confidence score of the overall predicted class", example=0.95)
    frames_processed: int = Field(..., description="The number of frames sampled and analyzed", example=45)
    frame_predictions: List[FramePrediction] = Field(..., description="Detailed prediction results for each sampled frame")

class LivePredictionResponse(BaseModel):
    predicted_class: str = Field(..., description="The predicted class for the current frame", example="helmet")
    confidence: float = Field(..., description="The confidence score of the prediction", example=0.94)
    detections: List[DetectionItem] = Field(default=[], description="List of object detections in the current frame")

# ----------------------------------------------------
# Helper Functions & Preprocessing Utilities
# ----------------------------------------------------
def check_model_ready():
    """Utility to verify model availability in application state."""
    if not hasattr(app.state, "model") or app.state.model is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The prediction model is currently not loaded. Please inspect system logs."
        )

def process_inference(model: YOLO, img: Any, return_annotated: bool = False) -> Dict[str, Any]:
    """
    Performs inference on a single image and processes findings.
    
    Args:
        model: Loaded YOLOv8 model.
        img: A PIL Image or numpy array.
        return_annotated: Whether to draw and return a base64 annotated image.
        
    Returns:
        Formatted prediction dictionary aligning with PredictionResponse schema.
    """
    # Run YOLOv8 inference (suppressing noisy console output)
    results = model(img, verbose=False)
    
    if not results or len(results) == 0:
        return {
            "predicted_class": "none",
            "confidence": 0.0,
            "all_probabilities": {name: 0.0 for name in model.names.values()},
            "detections": [],
            "annotated_image": None
        }
        
    result = results[0]
    classes = model.names
    
    # Initialize dictionary to map each class to its maximum detection confidence
    all_probabilities = {name: 0.0 for name in classes.values()}
    detections = []
    
    highest_conf = 0.0
    best_class_name = "none"
    
    # Parse bounding boxes, confidences, and labels
    if hasattr(result, "boxes") and result.boxes is not None:
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist()  # [xmin, ymin, xmax, ymax]
            
            class_name = classes.get(cls_id, f"class_{cls_id}")
            
            detections.append({
                "class_name": class_name,
                "confidence": conf,
                "box": xyxy
            })
            
            # Map maximum class confidence
            if conf > all_probabilities[class_name]:
                all_probabilities[class_name] = conf
                
            # Track overall best bounding box prediction
            if conf > highest_conf:
                highest_conf = conf
                best_class_name = class_name
                
    # If no detections made, default classification to "none"
    if highest_conf == 0.0:
        best_class_name = "none"
        
    annotated_image_base64 = None
    if return_annotated:
        try:
            plotted_img = result.plot()  # returns BGR numpy array
            _, buffer = cv2.imencode('.jpg', plotted_img)
            base64_str = base64.b64encode(buffer).decode('utf-8')
            annotated_image_base64 = f"data:image/jpeg;base64,{base64_str}"
        except Exception as e:
            logger.error(f"Failed to generate plotted annotated image: {e}")
        
    return {
        "predicted_class": best_class_name,
        "confidence": highest_conf,
        "all_probabilities": all_probabilities,
        "detections": detections,
        "annotated_image": annotated_image_base64
    }

async def decode_websocket_frame(data: Any) -> np.ndarray:
    """
    Decodes raw webcam frame data (base64 string or binary bytes) to an OpenCV BGR image.
    """
    try:
        if isinstance(data, str):
            # Parse possible base64 content type headers from frontend canvas strings
            if "," in data:
                data = data.split(",")[1]
            image_bytes = base64.b64decode(data)
            np_arr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("cv2.imdecode returned None for base64 data")
            return img
        elif isinstance(data, bytes):
            np_arr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("cv2.imdecode returned None for binary data")
            return img
        else:
            raise ValueError(f"Unsupported frame data type: {type(data)}")
    except Exception as e:
        logger.error(f"Failed to decode incoming webcam frame: {e}")
        raise ValueError(f"Incompatible video frame formatting: {e}")

# ----------------------------------------------------
# Endpoint Implementation
# ----------------------------------------------------

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Application Health Check",
    description="Check the system status and confirm that the YOLO model is loaded and ready.",
    status_code=status.HTTP_200_OK
)
def get_health():
    model_loaded = hasattr(app.state, "model") and app.state.model is not None
    return {
        "status": "healthy" if model_loaded else "degraded",
        "model_loaded": model_loaded
    }


@app.get(
    "/classes",
    response_model=ClassesResponse,
    summary="Get Prediction Classes",
    description="Dynamically retrieves all available PPE labels / classification groups supported by the model.",
    status_code=status.HTTP_200_OK
)
def get_classes():
    check_model_ready()
    # model.names is a dictionary, extract standard list of names sorted by ID
    classes_dict = app.state.classes
    classes_list = [classes_dict[i] for i in sorted(classes_dict.keys())]
    return {"classes": classes_list}


@app.get(
    "/model-info",
    response_model=ModelInfoResponse,
    summary="Get Model Information",
    description="Returns high-level metadata regarding the loaded YOLO model name, format, and supported classes.",
    status_code=status.HTTP_200_OK
)
def get_model_info():
    check_model_ready()
    model_name = os.path.basename(os.getenv("MODEL_PATH", MODEL_PATH))
    classes_dict = app.state.classes
    classes_list = [classes_dict[i] for i in sorted(classes_dict.keys())]
    
    return {
        "model_name": model_name,
        "model_type": "YOLOv8 Object Detection",
        "num_classes": len(classes_list),
        "classes": classes_list
    }


@app.post(
    "/predict/image",
    response_model=PredictionResponse,
    summary="Image Prediction Endpoint",
    description="Accepts an uploaded image, executes YOLO object detection, and maps detections to confidence scores.",
    status_code=status.HTTP_200_OK
)
async def predict_image(file: UploadFile = File(..., description="Image file to analyze (jpg, jpeg, png, webp)")):
    check_model_ready()
    
    # Validate uploaded file type
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {', '.join(allowed_extensions)}"
        )
        
    try:
        # Load file stream into PIL Image for YOLO input
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        image.load()  # Load image data into memory
            
        # Run inference using global process utility (with return_annotated=True)
        inference_result = process_inference(app.state.model, image, return_annotated=True)
        return inference_result
        
    except Exception as e:
        logger.error(f"Inference error during /predict/image execution: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process image inference: {str(e)}"
        )


@app.post(
    "/predict/video",
    response_model=VideoPredictionResponse,
    summary="Video Prediction Endpoint",
    description=(
        "Accepts video uploads, saves temporarily, samples frames intelligently based on "
        "total length to prevent system memory overload, runs YOLO model on samples, and returnsaggregated results."
    ),
    status_code=status.HTTP_200_OK
)
async def predict_video(file: UploadFile = File(..., description="Video file to analyze (mp4, avi, mov, mkv)")):
    check_model_ready()
    
    # Validate file type
    allowed_extensions = {".mp4", ".avi", ".mov", ".mkv"}
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported video format '{ext}'. Allowed formats: {', '.join(allowed_extensions)}"
        )
        
    # Write to a temporary file for OpenCV to capture
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_video:
        shutil.copyfileobj(file.file, temp_video)
        temp_video_path = temp_video.name
        
    try:
        cap = cv2.VideoCapture(temp_video_path)
        if not cap.isOpened():
            raise ValueError("OpenCV failed to initialize file stream capture.")
            
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            raise ValueError("Uploaded video file contains 0 frames or is corrupt.")
            
        # Define maximum frames to sample for low memory usage and high API speed
        MAX_SAMPLED_FRAMES = 30
        frame_step = max(1, total_frames // MAX_SAMPLED_FRAMES)
        
        frame_predictions = []
        processed_count = 0
        
        overall_probabilities = {name: 0.0 for name in app.state.classes.values()}
        overall_best_class = "none"
        overall_highest_conf = 0.0
        
        for idx in range(total_frames):
            # Skip frames according to step rate
            if idx % frame_step != 0:
                continue
                
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret:
                break
                
            # Perform inference on frame
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = process_inference(app.state.model, frame_rgb)
            
            # Map detections
            detections = [
                DetectionItem(
                    class_name=d["class_name"],
                    confidence=d["confidence"],
                    box=d["box"]
                ) for d in result["detections"]
            ]
            
            # Track overall best prediction across the entire video
            if result["confidence"] > overall_highest_conf:
                overall_highest_conf = result["confidence"]
                overall_best_class = result["predicted_class"]
                
            frame_predictions.append(
                FramePrediction(
                    frame_index=idx,
                    predicted_class=result["predicted_class"],
                    confidence=result["confidence"],
                    detections=detections
                )
            )
            processed_count += 1
            
        cap.release()
        
        return VideoPredictionResponse(
            predicted_class=overall_best_class,
            confidence=overall_highest_conf,
            frames_processed=processed_count,
            frame_predictions=frame_predictions
        )
        
    except Exception as e:
        logger.error(f"Inference error during /predict/video execution: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process video inference: {str(e)}"
        )
        
    finally:
        # Clean up temporary video file safely
        if os.path.exists(temp_video_path):
            try:
                os.remove(temp_video_path)
            except Exception as clean_err:
                logger.warning(f"Failed to delete temp video file {temp_video_path}: {clean_err}")


@app.websocket("/ws/live-prediction")
async def websocket_prediction(websocket: WebSocket):
    """
    WebSocket endpoint for real-time video stream detection.
    Accepts raw images (base64 string or binary bytes) and sends back live predictions.
    """
    await websocket.accept()
    logger.info("New live webcam WebSocket prediction client connected.")
    
    if not hasattr(app.state, "model") or app.state.model is None:
        logger.error("Websocket rejected connection because model is not loaded.")
        await websocket.send_json({
            "error": "Model is not loaded on server. Connection terminated."
        })
        await websocket.close()
        return
        
    try:
        while True:
            # Wait for message sent by client
            message = await websocket.receive()
            
            # Check if client disconnected
            if message.get("type") == "websocket.disconnect":
                logger.info("Webcam WebSocket prediction client sent disconnect frame.")
                break
                
            if "text" in message:
                payload = message["text"]
            elif "bytes" in message:
                payload = message["bytes"]
            else:
                # Handle connection heartbeat or keep-alive frames
                continue
                
            # Decode frame
            try:
                frame_img = await decode_websocket_frame(payload)
                # Convert BGR to RGB for YOLOv8
                frame_rgb = cv2.cvtColor(frame_img, cv2.COLOR_BGR2RGB)
                
                # Perform rapid inference via shared process utility
                result = process_inference(app.state.model, frame_rgb, return_annotated=False)
                
                detections = [
                    DetectionItem(
                        class_name=d["class_name"],
                        confidence=d["confidence"],
                        box=d["box"]
                    ) for d in result["detections"]
                ]
                            
                # Send result frame payload back to client
                response = LivePredictionResponse(
                    predicted_class=result["predicted_class"],
                    confidence=result["confidence"],
                    detections=detections
                )
                await websocket.send_json(response.model_dump())
                
            except Exception as inner_err:
                logger.warning(f"Error handling frame in websocket pipeline: {inner_err}")
                await websocket.send_json({
                    "predicted_class": "none",
                    "confidence": 0.0,
                    "error": str(inner_err)
                })
                
    except WebSocketDisconnect:
        logger.info("Webcam WebSocket prediction client disconnected gracefully.")
    except Exception as e:
        logger.error(f"Unexpected WebSocket prediction crash: {e}", exc_info=True)
    finally:
        # Final cleanup safety block
        try:
            await websocket.close()
        except Exception:
            pass

# ----------------------------------------------------
# Main Startup Entrypoint
# ----------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    # Start ASGI server
    logger.info("Launching server directly from main entrypoint...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
