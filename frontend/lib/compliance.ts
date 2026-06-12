import { DetectionItem } from '../types';

export interface ComplianceReport {
  score: number;
  status: 'SECURE' | 'WARNING' | 'VIOLATION';
  alerts: string[];
  summary: {
    people: number;
    helmets: number;
    vests: number;
    infractions: number;
  };
}

export function calculateCompliance(detections: DetectionItem[] = []): ComplianceReport {
  const safeDetections = detections || [];
  const alerts: string[] = [];
  
  let peopleCount = 0;
  let helmetCount = 0;
  let vestCount = 0;
  let gogglesCount = 0;
  let glovesCount = 0;
  let bootsCount = 0;

  let explicitNoHelmet = 0;
  let explicitNoVest = 0; // if model supports no_vest
  let explicitNoGoggles = 0;
  let explicitNoGloves = 0;
  let explicitNoBoots = 0;

  safeDetections.forEach((d) => {
    const cls = d.class_name.toLowerCase();
    if (cls === 'person') peopleCount++;
    else if (cls === 'helmet') helmetCount++;
    else if (cls === 'vest') vestCount++;
    else if (cls === 'goggles' || cls === 'goggle') gogglesCount++;
    else if (cls === 'gloves' || cls === 'glove') glovesCount++;
    else if (cls === 'boots' || cls === 'boot') bootsCount++;
    else if (cls === 'no_helmet' || cls === 'no-helmet') explicitNoHelmet++;
    else if (cls === 'no_goggle' || cls === 'no-goggle' || cls === 'no_goggles') explicitNoGoggles++;
    else if (cls === 'no_gloves' || cls === 'no-gloves' || cls === 'no_glove') explicitNoGloves++;
    else if (cls === 'no_boots' || cls === 'no-boots' || cls === 'no_boot') explicitNoBoots++;
  });

  // Calculate missing items if not explicitly labeled but people are present
  // If there are people, we expect at least that many helmets and vests.
  let inferredMissingHelmets = 0;
  let inferredMissingVests = 0;

  if (peopleCount > 0) {
    if (helmetCount < peopleCount) {
      inferredMissingHelmets = peopleCount - helmetCount;
    }
    if (vestCount < peopleCount) {
      inferredMissingVests = peopleCount - vestCount;
    }
  }

  // Compile active warning alerts
  const totalMissingHelmets = Math.max(explicitNoHelmet, inferredMissingHelmets);
  const totalMissingVests = Math.max(explicitNoVest, inferredMissingVests);

  if (totalMissingHelmets > 0) {
    alerts.push(`Missing Helmet ❌ (${totalMissingHelmets} worker${totalMissingHelmets > 1 ? 's' : ''})`);
  }
  if (totalMissingVests > 0) {
    alerts.push(`Missing Safety Vest ❌ (${totalMissingVests} worker${totalMissingVests > 1 ? 's' : ''})`);
  }
  if (explicitNoGoggles > 0) {
    alerts.push(`Missing Safety Goggles ❌ (${explicitNoGoggles} worker${explicitNoGoggles > 1 ? 's' : ''})`);
  }
  if (explicitNoGloves > 0) {
    alerts.push(`Missing Protective Gloves ❌ (${explicitNoGloves} worker${explicitNoGloves > 1 ? 's' : ''})`);
  }
  if (explicitNoBoots > 0) {
    alerts.push(`Missing Protective Boots ❌ (${explicitNoBoots} worker${explicitNoBoots > 1 ? 's' : ''})`);
  }

  // Calculate compliance score
  // If there are no people and no infractions, compliance is 100%.
  // If people are detected, we base the score on expected gear vs actual gear.
  let score = 100;
  const infractionsCount = totalMissingHelmets + totalMissingVests + explicitNoGoggles + explicitNoGloves + explicitNoBoots;

  if (peopleCount > 0) {
    // Total expected safety items (helmet + vest) per person
    const expectedItemsPerPerson = 2; 
    const totalExpectedGear = peopleCount * expectedItemsPerPerson;
    
    // Total actual compliant gear
    const totalCompliantGear = Math.min(helmetCount, peopleCount) + Math.min(vestCount, peopleCount);
    
    // Score based on ratio of compliant gear to expected gear
    const rawScore = totalExpectedGear > 0 ? (totalCompliantGear / totalExpectedGear) * 100 : 100;
    
    // Apply further penalty for other violations (goggles, gloves, boots)
    const penalty = (explicitNoGoggles + explicitNoGloves + explicitNoBoots) * 15;
    score = Math.max(0, Math.round(rawScore - penalty));
  } else if (infractionsCount > 0) {
    // If no people but explicit violations are detected (e.g. cropped images)
    score = Math.max(0, 100 - (infractionsCount * 25));
  }

  // Determine site status
  let status: 'SECURE' | 'WARNING' | 'VIOLATION' = 'SECURE';
  if (score < 70) {
    status = 'VIOLATION';
  } else if (score < 100) {
    status = 'WARNING';
  }

  return {
    score,
    status,
    alerts,
    summary: {
      people: peopleCount,
      helmets: helmetCount,
      vests: vestCount,
      infractions: infractionsCount,
    },
  };
}
