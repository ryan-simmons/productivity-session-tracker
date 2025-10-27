import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, X, Info } from 'lucide-react';

interface CreateSessionProps {
  onSessionCreated: () => void;
}

const daysOfWeek = [
    { label: 'S', value: 'Sun' }, { label: 'M', value: 'Mon' }, { label: 'T', value: 'Tue' },
    { label: 'W', value: 'Wed' }, { label: 'T', value: 'Thu' }, { label: 'F', value: 'Fri' },
    { label: 'S', value: 'Sat' }
];

export function CreateSession({ onSessionCreated }: CreateSessionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(45);
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatDays, setRepeatDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handleDayClick = (dayValue: string) => {
    setRepeatDays(prev =>
        prev.includes(dayValue) ? prev.filter(d => d !== dayValue) : [...prev, dayValue]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError('');
    setLoading(true);

    try {
        if (isRepeating) {
            if (repeatDays.length === 0) throw new Error("Please select at least one day for repeating sessions.");
            if (!startTime) throw new Error("Please select a time for the repeating session.");
            
            const { error: insertError } = await supabase.from('repeating_sessions').insert({
                user_id: user.id,
                task_name: taskName,
                duration_minutes: duration,
                scheduled_time: startTime,
                repeat_days: repeatDays,
            });
            if (insertError) throw insertError;
        } else {
            const scheduledStart = new Date(`${startDate}T${startTime}`);
            if (scheduledStart <= new Date()) throw new Error('Session must be scheduled in the future');
            
            const { error: insertError } = await supabase.from('sessions').insert({
                user_id: user.id,
                task_name: taskName,
                scheduled_start: scheduledStart.toISOString(),
                duration_minutes: duration,
                status: 'scheduled'
            });
            if (insertError) throw insertError;
        }

      // Reset form on success
      setTaskName('');
      setStartDate('');
      setStartTime('');
      setDuration(45);
      setIsRepeating(false);
      setRepeatDays([]);
      setIsOpen(false);
      onSessionCreated();
    } catch (err: any) {
        const errorMessage = err.message || 'An unknown error occurred.';
        setError(`Failed to create session: ${errorMessage}`);
        console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getLocalTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const today = getLocalTodayString();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white py-3 rounded-lg font-bold transition-all duration-300 hover:opacity-90 flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Schedule New Session
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-6 w-full max-w-md border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">New Session</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-white transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                  Task Name
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none placeholder-neutral-500 transition"
                  placeholder="e.g., Math Homework"
                />
              </div>

              <div className="flex items-center justify-between bg-white/5 p-1 rounded-lg">
                  <label className="text-sm font-medium text-neutral-300 ml-2">Repeat Session</label>
                  <button
                      type="button"
                      onClick={() => setIsRepeating(prev => !prev)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isRepeating ? 'bg-[#5F85DB]' : 'bg-neutral-600'}`}
                  >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRepeating ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
              </div>

              {isRepeating ? (
                  <div>
                      <label className="block text-sm font-medium text-neutral-300 mb-1">Repeat on</label>
                      <div className="flex justify-between gap-1">
                          {daysOfWeek.map((day) => (
                              <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => handleDayClick(day.value)}
                                  className={`w-9 h-9 rounded-full font-bold text-sm transition-colors ${repeatDays.includes(day.value) ? 'bg-[#90B8F8] text-black' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}
                              >
                                  {day.label}
                              </button>
                          ))}
                      </div>
                  </div>
              ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-neutral-300 mb-1">Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                min={today}
                                required={!isRepeating}
                                className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none [color-scheme:dark] transition"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-neutral-300 mb-1">Time</label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                required
                                className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none [color-scheme:dark] transition"
                            />
                        </div>
                    </div>
              )}

                {isRepeating && (
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">Time</label>
                        <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            required
                            className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none [color-scheme:dark] transition"
                        />
                    </div>
                )}


              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  min={1}
                  max={300}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none mt-2 placeholder-neutral-500 transition"
                  placeholder="Enter duration in minutes"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {!isRepeating && (
                <div className="flex items-start gap-3 text-neutral-400 text-sm pt-2">
                    <Info className="w-5 h-5 shrink-0 mt-0.5 text-[#5F85DB]" />
                    <span>
                        <span className="font-semibold text-neutral-300">Heads up:</span> Once a session is created, it cannot be edited. Commit.
                    </span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white py-3 rounded-lg font-bold transition-all duration-300 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? 'Creating...' : 'Create Session'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}