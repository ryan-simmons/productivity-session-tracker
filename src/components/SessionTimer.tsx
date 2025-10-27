import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateProductivityScore, getDelayMinutes, getCompletionPercentage } from '../lib/scoring';
import { Play, Square, Clock, AlertTriangle, Check } from 'lucide-react';

// Define the structure for the session data we'll save to localStorage
interface StoredSessionState {
  sessionId: string;
  startTimeISO: string;
}

const STORAGE_KEY = 'activeSessionTimer';

interface Session {
  id: string;
  task_name: string;
  scheduled_start: string;
  duration_minutes: number;
  status: string;
}

interface SessionTimerProps {
  session: Session;
  onComplete: () => void;
  startImmediately: boolean;
}

export function SessionTimer({ session, onComplete, startImmediately }: SessionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(session.duration_minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [actualStart, setActualStart] = useState<Date | null>(null);
  const [showReflection, setShowReflection] = useState(false);
  const [showEndEarlyConfirm, setShowEndEarlyConfirm] = useState(false);
  const [endEarlyCountdown, setEndEarlyCountdown] = useState(15);
  const [reflection, setReflection] = useState('');
  const intervalRef = useRef<number>();
  const { user } = useAuth();

  // On component mount, check for a running session in localStorage
  useEffect(() => {
    try {
      const storedStateJSON = localStorage.getItem(STORAGE_KEY);
      if (storedStateJSON) {
        const storedState: StoredSessionState = JSON.parse(storedStateJSON);
        
        // Ensure the stored session matches the one we are supposed to display
        if (storedState.sessionId === session.id) {
          const startTime = new Date(storedState.startTimeISO);
          const elapsedSeconds = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
          const remaining = (session.duration_minutes * 60) - elapsedSeconds;

          if (remaining > 0) {
            setActualStart(startTime);
            setTimeRemaining(remaining);
            setIsRunning(true);
          } else {
            // Timer finished while the tab was closed
            handleComplete();
          }
        }
      }
    } catch (error) {
      console.error("Failed to parse stored session state:", error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [session.id]);

  // Auto-start logic for new sessions
  useEffect(() => {
    if (startImmediately && !isRunning && !actualStart) {
        handleStart();
    }
  }, [startImmediately, isRunning, actualStart]);

  // Timer countdown logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  // Countdown for End Early confirmation
  useEffect(() => {
    let timer: number;
    if (showEndEarlyConfirm && endEarlyCountdown > 0) {
      timer = window.setInterval(() => {
        setEndEarlyCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showEndEarlyConfirm, endEarlyCountdown]);

  const handleStart = async () => {
    if (!actualStart) {
      const now = new Date();
      setActualStart(now);
      
      // Save session state to localStorage
      const stateToStore: StoredSessionState = {
        sessionId: session.id,
        startTimeISO: now.toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStore));

      await supabase
        .from('sessions')
        .update({ status: 'in_progress' })
        .eq('id', session.id);
    }
    setIsRunning(true);
  };

  const handleComplete = async () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setShowReflection(true);
  };

  const handleEndEarly = () => {
    setIsRunning(false);
    setEndEarlyCountdown(15);
    setShowEndEarlyConfirm(true);
  };

  const confirmEndEarly = () => {
    setShowEndEarlyConfirm(false);
    setShowReflection(true);
  };

  const cancelEndEarly = () => {
    setShowEndEarlyConfirm(false);
    setIsRunning(true);
  };

  const submitReflection = async () => {
    if (!user || !actualStart) return;

    const now = new Date();
    const completedSeconds = (session.duration_minutes * 60) - timeRemaining;
    const completedMinutes = Math.floor(completedSeconds / 60);

    // Call the updated scoring function without `currentStreak`
    const score = calculateProductivityScore({
      scheduledStart: new Date(session.scheduled_start),
      actualStart,
      durationMinutes: session.duration_minutes,
      completedMinutes,
    });
    
    // Auto-fail logic remains the same
    const scheduledDate = new Date(session.scheduled_start);
    let deadline = new Date(scheduledDate);
    deadline.setHours(23, 59, 59, 999);
    if (scheduledDate.getHours() >= 20) {
        deadline.setTime(scheduledDate.getTime() + 12 * 60 * 60 * 1000);
    }

    const finalScore = (actualStart > deadline) ? 0 : score.totalScore;
    const delayMinutes = getDelayMinutes(new Date(session.scheduled_start), actualStart);
    const wasOnTime = (actualStart <= deadline) && delayMinutes <= 1;

    // Database updates remain largely the same
    const completionPercentage = getCompletionPercentage(completedMinutes, session.duration_minutes);
    await supabase.from('session_logs').insert({
      session_id: session.id,
      user_id: user.id,
      actual_start: actualStart.toISOString(),
      actual_end: now.toISOString(),
      start_delay_minutes: delayMinutes,
      completion_percentage: completionPercentage,
      was_paused: false,
      pause_duration_minutes: 0,
      reflection_note: reflection || null,
      productivity_score: finalScore
    });

    await supabase
      .from('sessions')
      .update({ status: 'completed' })
      .eq('id', session.id);

    // Streak and stats logic remains the same
    const wasCompleted = completionPercentage >= 100;
    const { data: existingStats } = await supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle();

    if (existingStats) {
      const newStreak = wasOnTime && wasCompleted ? existingStats.current_streak + 1 : 0;
      await supabase.from('user_stats').update({
          current_streak: newStreak,
          longest_streak: Math.max(newStreak, existingStats.longest_streak),
          total_sessions: existingStats.total_sessions + 1,
          total_on_time: existingStats.total_on_time + (wasOnTime ? 1 : 0),
          total_completed: existingStats.total_completed + (wasCompleted ? 1 : 0),
          average_score: (existingStats.average_score * existingStats.total_sessions + finalScore) / (existingStats.total_sessions + 1),
          last_session_date: new Date().toISOString().split('T')[0]
        }).eq('user_id', user.id);
    } else {
        await supabase.from('user_stats').insert({
            user_id: user.id,
            current_streak: wasOnTime && wasCompleted ? 1 : 0,
            longest_streak: wasOnTime && wasCompleted ? 1 : 0,
            total_sessions: 1,
            total_on_time: wasOnTime ? 1 : 0,
            total_completed: wasCompleted ? 1 : 0,
            average_score: finalScore,
            last_session_date: new Date().toISOString().split('T')[0]
        });
    }

    // IMPORTANT: Clear the stored session state on completion
    localStorage.removeItem(STORAGE_KEY);
    
    onComplete();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const progress = ((session.duration_minutes * 60 - timeRemaining) / (session.duration_minutes * 60)) * 100;

  // --- JSX remains unchanged ---

  if (showEndEarlyConfirm) {
    return (
      <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-8 border border-red-500/50">
        <div className="text-center mb-6">
          <div className="bg-gradient-to-br from-red-500 to-orange-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Are You Sure?</h2>
          <p className="text-neutral-400 mb-4">Quitting early breaks consistency. Remember your purpose and push through.</p>

          <div className="text-sm text-neutral-500 mb-2">
            {endEarlyCountdown > 0 ? (
              <>You can end in <span className="font-semibold text-neutral-300">{endEarlyCountdown}s</span></>
            ) : (
              <span className="text-[#90B8F8] font-medium">You can end the session now</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={confirmEndEarly}
            disabled={endEarlyCountdown > 0}
            className="w-full py-3 rounded-lg font-bold transition disabled:bg-white/5 disabled:text-white/50 disabled:cursor-not-allowed bg-gradient-to-r from-red-500 to-pink-500 text-white hover:opacity-90"
          >
            {endEarlyCountdown > 0 ? `End Anyway (${endEarlyCountdown})` : 'End Anyway'}
          </button>
          <button
            onClick={cancelEndEarly}
            className="w-full bg-white/5 text-neutral-300 py-3 rounded-lg font-bold hover:bg-white/10 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (showReflection) {
    return (
      <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
        <div className="text-center mb-6">
          <div className="bg-gradient-to-br from-[#5F85DB] to-[#90B8F8] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-black" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Session Complete</h2>
          <p className="text-neutral-400">How did it go?</p>
        </div>

        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="Add a quick reflection (optional)..."
          className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none mb-4 h-24 resize-none placeholder-neutral-500"
        />

        <button
          onClick={submitReflection}
          className="w-full bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white py-3 rounded-lg font-bold transition-all duration-300 hover:opacity-90"
        >
          Complete Session
        </button>
      </div>
    );
  }

  return (
    <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">{session.task_name}</h2>
        <div className="flex items-center justify-center gap-2 text-neutral-400">
          <Clock className="w-4 h-4" />
          <span className="text-sm">{session.duration_minutes} minute session</span>
        </div>
      </div>

      <div className="mb-8">
        <div className="text-6xl font-bold text-center text-white mb-4 font-mono tracking-widest">
          {formatTime(timeRemaining)}
        </div>
        <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex gap-3">
        {!isRunning ? (
          <button
            onClick={handleStart}
            className="flex-1 bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white py-4 rounded-xl font-bold hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5" />
            {actualStart ? 'Resume' : 'Start'}
          </button>
        ) : (
          <button
            onClick={handleEndEarly}
            className="flex-1 bg-white/5 text-neutral-300 py-4 rounded-xl font-bold hover:bg-white/10 transition flex items-center justify-center gap-2"
          >
            <Square className="w-5 h-5" />
            End Early
          </button>
        )}
      </div>
    </div>
  );
}