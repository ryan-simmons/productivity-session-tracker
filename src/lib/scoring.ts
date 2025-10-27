/**
 * Defines the input required to calculate the productivity score.
 * The 'currentStreak' property has been removed as it is no longer used.
 */
export interface ProductivityScoreInput {
  scheduledStart: Date;
  actualStart: Date;
  durationMinutes: number;
  completedMinutes: number;
}

/**
 * Provides a detailed breakdown of the final productivity score,
 * reflecting the new scoring pillars.
 */
export interface ScoreBreakdown {
  promptnessScore: number;
  focusScore: number;
  commitmentBonus: number;
  totalScore: number;
}

/**
 * Calculates a dynamic and intuitive productivity score based on a user's session data.
 * The scoring is based on three pillars:
 * 1. Promptness: How punctual the user was (with a 2-minute grace period).
 * 2. Focus: How much of the scheduled session was actually completed.
 * 3. Commitment: A bonus that rewards sustained focus in longer sessions.
 *
 * @param input The user's session details.
 * @returns A ScoreBreakdown object with the detailed scoring.
 */
export function calculateProductivityScore(input: ProductivityScoreInput): ScoreBreakdown {
  const { scheduledStart, actualStart, durationMinutes, completedMinutes } = input;

  // --- Pillar 1: Promptness Score (Max 30 points) ---
  const delayMinutes = getDelayMinutes(scheduledStart, actualStart);
  let promptnessScore: number;

  if (delayMinutes <= 2) {
    // A 2-minute grace period for a perfect score.
    promptnessScore = 30;
  } else if (delayMinutes <= 10) {
    // A gentle, linear penalty for a minor delay (2 to 10 minutes).
    // Loses ~1.88 points for each minute late after the grace period.
    promptnessScore = 30 - 1.875 * (delayMinutes - 2);
  } else if (delayMinutes <= 30) {
    // A steeper penalty for significant delays (10 to 30 minutes).
    // The score drops from 15 to 0 in this range.
    promptnessScore = 15 - 0.75 * (delayMinutes - 10);
  } else {
    // Any delay over 30 minutes results in 0 points for promptness.
    promptnessScore = 0;
  }

  // --- Pillar 2: Focus Score (Max 60 points) ---
  // This score is directly proportional to the percentage of the session completed.
  const completionPercentage = getCompletionPercentage(completedMinutes, durationMinutes);
  const focusScore = (completionPercentage / 100) * 60;

  // --- Pillar 3: Commitment Bonus (Max 10 points) ---
  // A bonus rewarding sustained effort, based on the number of minutes COMPLETED.
  // Uses a logistic function (S-curve) for a smooth, dynamic reward.
  // The bonus ramps up significantly for sessions between 30 and 90 minutes.
  // A 45-minute completed session yields half of the maximum bonus.
  const maxBonus = 10;
  // The value is slightly higher than 10 to ensure that at high completion times, it rounds to 10.
  const commitmentBonus = (maxBonus + 0.5) / (1 + Math.exp(-0.07 * (completedMinutes - 45)));

  // --- Final Calculation ---
  // The total score is the sum of all parts, capped at 100.
  const totalScore = Math.min(100, promptnessScore + focusScore + commitmentBonus);

  return {
    promptnessScore: Math.round(promptnessScore),
    focusScore: Math.round(focusScore),
    commitmentBonus: Math.round(commitmentBonus),
    totalScore: Math.round(totalScore),
  };
}

/**
 * Helper function to calculate the delay in minutes between two dates.
 * A negative result indicates starting early.
 * @param scheduledStart The planned start time.
 * @param actualStart The actual start time.
 * @returns The delay in whole minutes.
 */
export function getDelayMinutes(scheduledStart: Date, actualStart: Date): number {
  const delayMilliseconds = actualStart.getTime() - scheduledStart.getTime();
  return Math.floor(delayMilliseconds / (1000 * 60));
}

/**
 * Helper function to calculate the completion percentage of a session.
 * @param completedMinutes The minutes the user actually worked.
 * @param durationMinutes The total scheduled duration of the session.
 * @returns The completion percentage (0-100).
 */
export function getCompletionPercentage(completedMinutes: number, durationMinutes: number): number {
  if (durationMinutes <= 0) {
    return 0;
  }
  const ratio = completedMinutes / durationMinutes;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}