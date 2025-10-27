import YourIcon from '../assets/logov1.svg?react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SessionTimer } from './SessionTimer';
import { YourJourney } from './Analytics';
import {
    LogOut,
    BarChart3,
    Home,
    Award,
    Flame,
    Sun,
    ArrowUp,
    ArrowDown,
    Minus,
    CalendarPlus,
    Clock,
    Plus,
    X,
    Info,
    Hourglass,
    Play,
    Trash2,
    Repeat,
    Layers,
    MoreVertical, // <-- ADDED ICON
    AlertTriangle // <-- ADDED ICON
} from 'lucide-react';

// --- Interfaces ---
interface Session {
    id: string;
    task_name: string;
    scheduled_start: string;
    duration_minutes: number;
    status: string;
}

interface RepeatingSession {
    id: string;
    task_name: string;
    duration_minutes: number;
    scheduled_time: string; // "HH:MM:SS"
    repeat_days: string[]; // e.g., ["Mon", "Wed", "Fri"]
}

interface UserStats {
    current_streak: number;
    total_sessions: number;
    average_score: number;
}

interface SessionLog {
    productivity_score: number;
    created_at: string;
}

type View = 'home' | 'analytics';
type ComparisonView = 'daily' | 'weekly' | 'monthly';

// --- FIX: Helper function to check and create sessions from repeating templates ---
const checkAndCreateRepeatingSessions = async (
    repeatingSessions: RepeatingSession[],
    userId: string
) => {
    if (!repeatingSessions || repeatingSessions.length === 0) return false;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeekMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayDay = dayOfWeekMap[today.getDay()];

    const dueToday = repeatingSessions.filter(rs => rs.repeat_days.includes(todayDay));
    if (dueToday.length === 0) return false;

    const { data: existingTodaySessions, error: fetchError } = await supabase
        .from('sessions')
        .select('task_name')
        .eq('user_id', userId)
        .gte('scheduled_start', `${todayStr}T00:00:00.000Z`)
        .lte('scheduled_start', `${todayStr}T23:59:59.999Z`);

    if (fetchError) {
        console.error("Error fetching today's sessions to prevent duplicates:", fetchError);
        return false;
    }

    const existingTaskNames = new Set(existingTodaySessions.map(s => s.task_name));
    const sessionsToCreate = [];

    for (const rs of dueToday) {
        if (!existingTaskNames.has(rs.task_name)) {
            const [hour, minute, second] = rs.scheduled_time.split(':');
            const scheduledStart = new Date();
            scheduledStart.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
            scheduledStart.setHours(parseInt(hour, 10), parseInt(minute, 10), parseInt(second || '0', 10), 0);

            sessionsToCreate.push({
                user_id: userId,
                task_name: rs.task_name,
                scheduled_start: scheduledStart.toISOString(),
                duration_minutes: rs.duration_minutes,
                status: 'scheduled',
            });
        }
    }

    if (sessionsToCreate.length > 0) {
        const { error: insertError } = await supabase.from('sessions').insert(sessionsToCreate);
        if (insertError) {
            console.error("Error creating sessions from repeating schedule:", insertError);
            return false;
        }
        return true;
    }

    return false;
};


// --- Main Dashboard Component ---
export function Dashboard() {
    const [view, setView] = useState<View>('home');
    const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
    const [repeatingSessions, setRepeatingSessions] = useState<RepeatingSession[]>([]);
    const [startableSessions, setStartableSessions] = useState<Session[]>([]);
    const [activeSession, setActiveSession] = useState<Session | null>(null);
    const [startImmediately, setStartImmediately] = useState(false);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [todaysAverage, setTodaysAverage] = useState<number>(0);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [comparisonView, setComparisonView] = useState<ComparisonView>('daily');
    const [dailyComparison, setDailyComparison] = useState<number | null>(null);
    const [weeklyComparison, setWeeklyComparison] = useState<number | null>(null);
    const [monthlyComparison, setMonthlyComparison] = useState<number | null>(null);

    const [loading, setLoading] = useState(true);
    const { user, signOut } = useAuth();

    const [welcomeMessage, setWelcomeMessage] = useState<string>('');
    const [yesterdayScore, setYesterdayScore] = useState<number | null>(null);

    // --- NEW: State for options dropdown and delete confirmation ---
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const optionsMenuRef = useRef<HTMLDivElement>(null);


    // --- NEW: Close options dropdown when clicking outside ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
                setIsOptionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const loadData = async () => {
        if (!user) return;
        setLoading(true);

        // --- FIX: Step 1 - Fetch repeating session rules and create today's sessions if needed ---
        const repeatingSessionsResult = await supabase
            .from('repeating_sessions')
            .select('*')
            .eq('user_id', user.id);
        
        if (repeatingSessionsResult.data) {
            await checkAndCreateRepeatingSessions(repeatingSessionsResult.data, user.id);
            setRepeatingSessions(repeatingSessionsResult.data);
        }

        // --- FIX: Step 2 - Fetch all sessions for today, including newly created repeating ones ---
        const initialSessionsResult = await supabase
            .from('sessions')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['scheduled', 'in_progress']);

        if (initialSessionsResult.error) {
            console.error("Error fetching sessions:", initialSessionsResult.error);
            setLoading(false);
            return;
        }

        // --- The rest of the logic correctly handles overdue/missed sessions ---
        const now = new Date();
        const allFetchedSessions = initialSessionsResult.data || [];
        const overdueSessions: Session[] = [];
        const validScheduledSessions: Session[] = [];
        const inProgressSession = allFetchedSessions.find(s => s.status === 'in_progress');

        for (const session of allFetchedSessions) {
            if (session.status !== 'scheduled') continue;
            const scheduledStart = new Date(session.scheduled_start);
            if (now.getTime() > scheduledStart.getTime()) {
                const scheduledHour = scheduledStart.getHours();
                const eightHourGracePeriod = 8 * 60 * 60 * 1000;
                const isDifferentDay = now.toDateString() !== scheduledStart.toDateString();
                let isOverdue = false;
                if (isDifferentDay) {
                    if (scheduledHour < 20 || (now.getTime() - scheduledStart.getTime() > eightHourGracePeriod)) {
                        isOverdue = true;
                    }
                }
                if (isOverdue) {
                    overdueSessions.push(session);
                } else {
                    validScheduledSessions.push(session); // This session is past due but still valid to start
                }
            } else {
                validScheduledSessions.push(session);
            }
        }

        if (overdueSessions.length > 0) {
            const sessionUpdates = overdueSessions.map(s => supabase.from('sessions').update({ status: 'missed' }).eq('id', s.id));
            const logInserts = overdueSessions.map(s => supabase.from('session_logs').insert({ user_id: user.id, session_id: s.id, productivity_score: 0, completed_minutes: 0, notes: 'Session was missed.' }));
            const resetStreak = supabase.from('user_stats').update({ current_streak: 0 }).eq('user_id', user.id);
            await Promise.all([...sessionUpdates, ...logInserts, resetStreak]);
        }

        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const [statsResult, historicalLogsResult] = await Promise.all([
            supabase.from('user_stats').select('current_streak, total_sessions, average_score').eq('user_id', user.id).maybeSingle(),
            supabase.from('session_logs').select('productivity_score, created_at').eq('user_id', user.id).gte('created_at', sixtyDaysAgo.toISOString())
        ]);

        if (inProgressSession) {
            setActiveSession(inProgressSession);
            setStartImmediately(false);
            setStartableSessions([]);
            setUpcomingSessions([]);
        } else {
            const nowTime = new Date().getTime();
            const sortedValidSessions = validScheduledSessions.sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());
            
            // Sessions whose start time is in the past OR within the next minute are ready
            const readySessions = sortedValidSessions.filter(s => (new Date(s.scheduled_start).getTime() - nowTime <= 60000));
            const futureSessions = sortedValidSessions.filter(s => (new Date(s.scheduled_start).getTime() - nowTime > 60000));
            
            setStartableSessions(readySessions);
            setUpcomingSessions(futureSessions);
        }
        
        if (statsResult.data) setStats(statsResult.data);

        if (historicalLogsResult.data) {
            const logs = historicalLogsResult.data;
            const today = new Date();
            const calculateChange = (current: number | null, previous: number | null): number | null => {
                if (current === null || previous === null) return null;
                if (previous > 0) return ((current - previous) / previous) * 100;
                if (previous === 0 && current > 0) return 100;
                if (previous === 0 && current === 0) return 0;
                return null;
            };
            const { todayAvg, yesterdayAvg } = calculateDailyAverages(logs, today);
            setYesterdayScore(yesterdayAvg);
            setTodaysAverage(Math.round(todayAvg ?? 0));
            setDailyComparison(calculateChange(todayAvg, yesterdayAvg));
            const { thisWeekAvg, lastWeekAvg } = calculateWeeklyAverages(logs, today);
            setWeeklyComparison(calculateChange(thisWeekAvg, lastWeekAvg));
            const { thisMonthAvg, lastMonthAvg } = calculateMonthlyAverages(logs, today);
            setMonthlyComparison(calculateChange(thisMonthAvg, lastMonthAvg));
        }

        setLoading(false);
    };

    useEffect(() => {
        if (user) loadData();
    }, [user]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!activeSession && upcomingSessions.length > 0) {
                const now = new Date().getTime();
                const newlyReadySessions = upcomingSessions.filter(s => new Date(s.scheduled_start).getTime() - now <= 60000);

                if (newlyReadySessions.length > 0) {
                    setStartableSessions(prev => [...prev, ...newlyReadySessions].sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()));
                    setUpcomingSessions(prev => prev.filter(s => !newlyReadySessions.some(ready => ready.id === s.id)));
                }
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [upcomingSessions, activeSession]);
    
    useEffect(() => {
        const getWelcomeMessage = (score: number | null): string => {
            const goodScoreMessages = [ "Yesterday was great! Keep that momentum going.", "Amazing work yesterday! Let's do it again.", "You're on a roll! Keep up the fantastic effort.", ];
            const avgScoreMessages = [ "Solid effort yesterday. Let's aim even higher today!", "Good job yesterday. A little more focus can make today amazing.", "You're building good habits. Let's continue the progress.", ];
            const lowScoreMessages = [ "A new day is a new opportunity. Let's make it count!", "Shake off yesterday. Today is a fresh start.", "Let's focus up and make today better than yesterday.", ];
            const noScoreMessages = [ "Welcome! Ready to start your first session?", "A new day to be productive. Let's get started!", "Ready to crush some goals? Let's begin.", ];
            let messages: string[];
            if (score === null) messages = noScoreMessages;
            else if (score >= 80) messages = goodScoreMessages;
            else if (score >= 60) messages = avgScoreMessages;
            else messages = lowScoreMessages;
            return messages[Math.floor(Math.random() * messages.length)];
        };
        if (!loading) {
            setWelcomeMessage(getWelcomeMessage(yesterdayScore));
        }
    }, [yesterdayScore, loading]);

    const handleStartSession = (session: Session) => {
        setActiveSession(session);
        setStartImmediately(true);
        setStartableSessions(prev => prev.filter(s => s.id !== session.id));
    };

    const handleSessionComplete = () => {
        setActiveSession(null);
        setStartImmediately(false);
        loadData();
    };

    const handleSessionCreated = () => {
        setIsCreateModalOpen(false);
        loadData();
    };

    const handleDeleteRepeatingSession = async (sessionId: string) => {
        if (!user) return;
        setRepeatingSessions(prev => prev.filter(s => s.id !== sessionId));
        const { error } = await supabase.from('repeating_sessions').delete().eq('id', sessionId);
        if (error) {
            loadData();
            console.error("Failed to delete repeating session:", error);
        }
    };

    // --- NEW: Handle account deletion ---
    const handleDeleteAccount = async () => {
        if (!user) return;
    
        // IMPORTANT: This function calls a Supabase RPC function.
        // You MUST create this function in your Supabase SQL editor for it to work.
        // Go to Database > Functions > Create a new function.
        //
        // --- PASTE THE FOLLOWING SQL CODE ---
        //
        // create or replace function delete_user_account()
        // returns void
        // language plpgsql
        // security definer
        // as $$
        // begin
        //   -- Delete all data associated with the user from public tables
        //   delete from public.session_logs where user_id = auth.uid();
        //   delete from public.sessions where user_id = auth.uid();
        //   delete from public.repeating_sessions where user_id = auth.uid();
        //   delete from public.user_stats where user_id = auth.uid();
        //
        //   -- Finally, delete the user from the auth schema
        //   delete from auth.users where id = auth.uid();
        // end;
        // $$;
    
        const { error } = await supabase.rpc('delete_user_account');
    
        if (error) {
            console.error('Error deleting account:', error);
            // You might want to show a user-facing error message here
        } else {
            // On successful deletion, sign the user out, which will redirect them.
            signOut();
        }
        setIsDeleteConfirmOpen(false);
    };

    let activeTitle = '';
    let activeChange: number | null = null;
    switch (comparisonView) {
        case 'weekly': activeTitle = 'vs. Previous Week'; activeChange = weeklyComparison; break;
        case 'monthly': activeTitle = 'vs. Previous Month'; activeChange = monthlyComparison; break;
        default: activeTitle = 'vs. Yesterday'; activeChange = dailyComparison;
    }

    if (loading) {
        return <div className="min-h-screen bg-[#111111] flex items-center justify-center"><div className="text-[#5F85DB] animate-pulse">Loading...</div></div>;
    }

    return (
        <div className="min-h-screen bg-[#111111] text-neutral-200">
            <header className="bg-black/30 backdrop-blur-lg border-b border-white/10 sticky top-0 z-20">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <YourIcon className="w-8 h-8 text-[#90B8F8]" />
                        </div>
                        {/* --- MODIFIED: Options button and dropdown menu --- */}
                        <div className="relative" ref={optionsMenuRef}>
                            <button
                                onClick={() => setIsOptionsOpen(prev => !prev)}
                                className="p-2 text-neutral-400 hover:text-white transition"
                                aria-label="Options menu"
                            >
                                <MoreVertical className="w-5 h-5" />
                            </button>

                            {isOptionsOpen && (
                                <div className="absolute top-full right-0 mt-2 w-48 bg-black/90 backdrop-blur-lg border border-white/15 rounded-lg shadow-lg z-30 animate-fadeIn">
                                    <ul className="py-2">
                                        <li>
                                            <button
                                                onClick={signOut}
                                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-300 hover:bg-white/10 transition-colors"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                <span>Sign Out</span>
                                            </button>
                                        </li>
                                        <li>
                                            <button
                                                onClick={() => {
                                                    setIsDeleteConfirmOpen(true);
                                                    setIsOptionsOpen(false);
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <span>Delete Account</span>
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-grow max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 pb-40 sm:pb-32">
                <div className="animate-fadeIn">
                    {view === 'analytics' ? (
                        <YourJourney />
                    ) : activeSession ? (
                        <SessionTimer session={activeSession} onComplete={handleSessionComplete} startImmediately={startImmediately} />
                    ) : (
                        <div className="space-y-8">
                            <WelcomeHeader name={user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'} message={welcomeMessage} />

                            {startableSessions.length > 0 && (
                                <ReadySessionsManager sessions={startableSessions} onStart={handleStartSession} />
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <PerformanceSnapshot stats={stats} todaysAverage={todaysAverage} />
                                <ComparisonWidget
                                    comparisonView={comparisonView}
                                    setComparisonView={setComparisonView}
                                    activeTitle={activeTitle}
                                    activeChange={activeChange}
                                />
                            </div>

                            <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                                <h2 className="text-xl font-bold text-white mb-4">Upcoming Sessions</h2>
                                {upcomingSessions.length > 0 || repeatingSessions.length > 0 ? (
                                    <div className="space-y-6">
                                        {upcomingSessions.length > 0 && (
                                            <div className="space-y-4">
                                                {upcomingSessions.map((session) => <UpcomingSession key={session.id} session={session} />)}
                                            </div>
                                        )}
                                        {repeatingSessions.length > 0 && (
                                            <div>
                                                <h3 className="text-sm font-semibold text-neutral-400 border-t border-white/10 pt-4 mt-6 mb-4 flex items-center gap-2">
                                                    <Repeat className="w-4 h-4" />
                                                    Repeating Sessions
                                                </h3>
                                                <div className="space-y-4">
                                                    {repeatingSessions.map((session) => (
                                                        <RepeatingSessionCard 
                                                            key={session.id} 
                                                            session={session} 
                                                            onDelete={() => handleDeleteRepeatingSession(session.id)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <div className="bg-gradient-to-br from-[#5F85DB]/20 to-[#90B8F8]/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <CalendarPlus className="w-8 h-8 text-[#90B8F8]" />
                                        </div>
                                        <p className="text-white font-semibold">Your schedule is clear!</p>
                                        <p className="text-sm text-neutral-400 mt-1">Plan your next focus session to keep the momentum going.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <CreateSessionModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSessionCreated={handleSessionCreated}
            />

            {/* --- NEW: Render the delete confirmation modal --- */}
            <DeleteConfirmationModal
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                onConfirm={handleDeleteAccount}
            />

            <div className="hidden sm:block fixed top-1/2 -translate-y-1/2 left-6 z-30">
                <div className="flex flex-col gap-2 p-1.5 bg-black/30 backdrop-blur-lg border border-white/10 rounded-xl">
                    <NavButton icon={<Home />} isActive={view === 'home'} onClick={() => setView('home')} isMobile={false} />
                    <NavButton icon={<BarChart3 />} isActive={view === 'analytics'} onClick={() => setView('analytics')} isMobile={false} />
                </div>
            </div>
            <BottomNavBar
                view={view}
                setView={setView}
                onAddClick={() => setIsCreateModalOpen(true)}
            />
        </div>
    );
}

// --- NEW/MODIFIED Child Components ---

function ReadySessionsManager({ sessions, onStart }: { sessions: Session[]; onStart: (session: Session) => void; }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    if (sessions.length === 0) return null;

    const primarySession = sessions[0];
    const otherSessionsCount = sessions.length - 1;

    const handleStartFromModal = (session: Session) => {
        onStart(session);
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-3">
            <StartNowPrompt session={primarySession} onStart={() => onStart(primarySession)} />

            {otherSessionsCount > 0 && (
                <div className="text-center">
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="text-sm font-bold text-[#90B8F8] hover:text-white transition-colors duration-200"
                    >
                        +{otherSessionsCount} more {otherSessionsCount === 1 ? 'session is' : 'sessions are'} ready
                    </button>
                </div>
            )}

            <ReadySessionsModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                sessions={sessions}
                onStart={handleStartFromModal}
            />
        </div>
    );
}

function ReadySessionsModal({ isOpen, onClose, sessions, onStart }: { isOpen: boolean; onClose: () => void; sessions: Session[]; onStart: (session: Session) => void; }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-6 w-full max-w-md border border-white/10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Layers className="w-6 h-6 text-[#90B8F8]" />
                        Ready to Start
                    </h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white transition">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {sessions.map(session => (
                        <div key={session.id} className="bg-black/20 rounded-2xl p-4 border border-white/10 flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <h3 className="font-bold text-lg text-white">{session.task_name}</h3>
                                <div className="flex items-center gap-2 text-sm text-neutral-400 mt-1">
                                    <Hourglass className="w-4 h-4" />
                                    <span>{session.duration_minutes} min session</span>
                                </div>
                            </div>
                            <button
                                onClick={() => onStart(session)}
                                className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white px-4 py-2 rounded-lg font-bold transition hover:opacity-90"
                            >
                                <Play className="w-4 h-4" />
                                Start
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- NEW: Component for delete confirmation ---
function DeleteConfirmationModal({ isOpen, onClose, onConfirm }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-6 w-full max-w-md border border-white/10">
                <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-500/10 mb-4">
                        <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-bold leading-6 text-white" id="modal-title">
                        Delete Account
                    </h3>
                    <div className="mt-2">
                        <p className="text-sm text-neutral-400">
                            Are you sure you want to delete your account? All of your data, including sessions and stats, will be permanently removed. This action cannot be undone.
                        </p>
                    </div>
                </div>
                <div className="mt-6 flex justify-center gap-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex justify-center rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors"
                    >
                        Confirm Delete
                    </button>
                </div>
            </div>
        </div>
    );
}


// --- Unchanged Child Components ---

function RepeatingSessionCard({ session, onDelete }: { session: RepeatingSession; onDelete: () => void; }) {
    const formatTime = (time: string) => {
        const [hour, minute] = time.split(':');
        const date = new Date();
        date.setHours(Number(hour), Number(minute));
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    
    const daysOfWeek = [ { label: 'S', value: 'Sun' }, { label: 'M', value: 'Mon' }, { label: 'T', value: 'Tue' }, { label: 'W', value: 'Wed' }, { label: 'T', value: 'Thu' }, { label: 'F', value: 'Fri' }, { label: 'S', value: 'Sat' } ];
    const activeDays = new Set(session.repeat_days);

    return (
        <div className="bg-black/20 rounded-2xl p-5 border border-white/10 flex items-center justify-between gap-4">
            <div className="flex-1">
                <h3 className="font-bold text-lg text-white">{session.task_name}</h3>
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400 mt-2">
                    <div className="flex items-center gap-2"> <Clock className="w-4 h-4" /> <span>{formatTime(session.scheduled_time)}</span> </div>
                    <div className="flex items-center gap-2"> <Hourglass className="w-4 h-4" /> <span>{session.duration_minutes} min</span> </div>
                </div>
                <div className="flex gap-1.5 mt-3">
                    {daysOfWeek.map((day) => ( <div key={day.value} className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${activeDays.has(day.value) ? 'bg-[#90B8F8] text-black' : 'bg-white/10 text-neutral-400'}`}> {day.label} </div> ))}
                </div>
            </div>
            <button onClick={onDelete} className="p-2 text-neutral-500 hover:text-red-400 transition-colors rounded-full hover:bg-red-500/10"> <Trash2 className="w-5 h-5" /> </button>
        </div>
    );
}

function StartNowPrompt({ session, onStart }: { session: Session; onStart: (session: Session) => void; }) {
    return (
        <div className="bg-gradient-to-r from-[#5F85DB]/10 to-[#90B8F8]/10 rounded-2xl p-5 border border-[#90B8F8]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex-1">
                <p className="text-sm text-[#90B8F8] font-bold">READY TO START</p>
                <h3 className="font-bold text-xl text-white mt-1">{session.task_name}</h3>
                <div className="flex items-center gap-2 text-sm text-neutral-400 mt-1"> <Hourglass className="w-4 h-4" /> <span>{session.duration_minutes} minute session</span> </div>
            </div>
            <button onClick={() => onStart(session)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white px-6 py-3 rounded-lg font-bold transition-transform duration-200 hover:opacity-90 hover:scale-105 active:scale-100">
                <Play className="w-5 h-5" /> Start Now
            </button>
        </div>
    );
}

function WelcomeHeader({ name, message }: { name: string; message: string }) {
    return (
        <div>
            <h1 className="text-2xl font-bold text-white">Hello, <span className="bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] bg-clip-text text-transparent">{name}</span>!</h1>
            <p className="text-neutral-400">{message}</p>
        </div>
    );
}

function PerformanceSnapshot({ stats, todaysAverage }: { stats: UserStats | null, todaysAverage: number }) {
    const getScoreColor = (score: number): string => {
        if (score < 60) return 'text-red-400';
        if (score < 80) return 'text-blue-400';
        return 'text-green-400';
    };
    const myScoreValue = stats ? `${Math.round(stats.average_score)}%` : '—';
    const myScoreColor = stats ? getScoreColor(stats.average_score) : undefined;
    return (
        <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-5 border border-white/10 space-y-4">
            <h3 className="text-sm font-medium text-neutral-400">Performance Snapshot</h3>
            <StatCard icon={<Flame className="w-5 h-5 text-[#5F85DB]" />} title="Current Streak" value={stats?.current_streak || 0} isHighlighted={true} />
            <StatCard icon={<Award className="w-5 h-5 text-[#5F85DB]" />} title="My Score" value={myScoreValue} valueColor={myScoreColor} />
            <StatCard icon={<Sun className="w-5 h-5 text-[#5F85DB]" />} title="Today's Score" value={todaysAverage > 0 ? `${todaysAverage}%` : '—'} valueColor={todaysAverage > 0 ? getScoreColor(todaysAverage) : undefined} />
        </div>
    );
}

function ComparisonWidget({ comparisonView, setComparisonView, activeTitle, activeChange }: { comparisonView: ComparisonView, setComparisonView: (v: ComparisonView) => void, activeTitle: string, activeChange: number | null }) {
    return (
        <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-5 border border-white/10">
            <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="text-sm font-medium text-neutral-400">{activeTitle}</h3>
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg">
                    <button onClick={() => setComparisonView('daily')} className={`px-2 py-0.5 text-xs font-semibold rounded-md transition ${comparisonView === 'daily' ? 'bg-[#5F85DB] text-white' : 'text-neutral-300 hover:text-white'}`}>Day</button>
                    <button onClick={() => setComparisonView('weekly')} className={`px-2 py-0.5 text-xs font-semibold rounded-md transition ${comparisonView === 'weekly' ? 'bg-[#5F85DB] text-white' : 'text-neutral-300 hover:text-white'}`}>Week</button>
                    <button onClick={() => setComparisonView('monthly')} className={`px-2 py-0.5 text-xs font-semibold rounded-md transition ${comparisonView === 'monthly' ? 'bg-[#5F85DB] text-white' : 'text-neutral-300 hover:text-white'}`}>Month</button>
                </div>
            </div>
            <ComparisonDisplay change={activeChange} />
        </div>
    );
}

function BottomNavBar({ view, setView, onAddClick }: { view: View, setView: (v: View) => void, onAddClick: () => void }) {
    return (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 h-20 bg-black/30 backdrop-blur-lg z-20 border-t border-white/10">
            <div className="max-w-4xl mx-auto h-full flex justify-around items-center px-4">
                <NavButton icon={<Home />} label="Home" isActive={view === 'home'} onClick={() => setView('home')} />
                <button onClick={onAddClick} className="w-16 h-16 flex items-center justify-center bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white rounded-2xl -translate-y-1/3 shadow-lg shadow-blue-500/30 transition-transform hover:scale-110">
                    <Plus className="w-8 h-8" />
                </button>
                <NavButton icon={<BarChart3 />} label="Your Journey" isActive={view === 'analytics'} onClick={() => setView('analytics')} />
            </div>
        </div>
    );
}

function NavButton({ icon, label, isActive, onClick, isMobile = true }: { icon: JSX.Element, label?: string, isActive: boolean, onClick: () => void, isMobile?: boolean }) {
    if (isMobile) {
        return ( <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 w-24 transition-colors duration-300 ${isActive ? 'text-[#90B8F8]' : 'text-neutral-400 hover:text-white'}`}> {icon} <span className={`text-xs font-bold ${isActive ? 'text-white' : ''}`}>{label}</span> </button> );
    }
    return ( <button onClick={onClick} className={`p-3 rounded-lg transition-colors duration-300 ${isActive ? 'bg-[#5F85DB] text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-white'}`}> {icon} </button> )
}

function StatCard({ icon, title, value, valueColor, isHighlighted = false }: { icon: JSX.Element; title: string; value: string | number; valueColor?: string; isHighlighted?: boolean; }) {
    const baseClasses = "rounded-lg p-3 border flex items-center justify-between transition-colors duration-300";
    const highlightedClasses = "bg-gradient-to-r from-[#5F85DB]/10 to-[#90B8F8]/10 border-[#90B8F8]/40";
    const defaultClasses = "bg-[#1C1C1E]/60 border-white/10";
    return (
        <div className={`${baseClasses} ${isHighlighted ? highlightedClasses : defaultClasses}`}>
            <div className="flex items-center gap-3"> {icon} <span className="text-sm font-medium text-neutral-300">{title}</span> </div>
            <p className={`text-xl font-bold ${valueColor || 'text-white'}`}>{value}</p>
        </div>
    );
}

function UpcomingSession({ session }: { session: Session; }) {
    const formatTimeUntil = (scheduledStart: string) => {
        const diff = new Date(scheduledStart).getTime() - new Date().getTime();
        if (diff <= 0) return 'Ready now';
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        if (hours >= 24) return `in ${Math.floor(hours / 24)}d`;
        if (hours > 0) return `in ${hours}h ${minutes % 60}m`;
        if (minutes < 1) return 'soon';
        return `in ${minutes}m`;
    };
    return (
        <div className="bg-black/20 rounded-2xl p-5 border border-white/10 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
                <h3 className="font-bold text-lg text-white">{session.task_name}</h3>
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400 mt-2">
                    <div className="flex items-center gap-2"> <Clock className="w-4 h-4" /> <span>{new Date(session.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> </div>
                    <div className="flex items-center gap-2"> <Hourglass className="w-4 h-4" /> <span>{session.duration_minutes} min</span> </div>
                </div>
            </div>
            <div className="sm:ml-4"> <div className="bg-neutral-900 text-neutral-300 text-xs font-semibold px-3 py-1.5 rounded-full self-start sm:self-center"> {formatTimeUntil(session.scheduled_start)} </div> </div>
        </div>
    );
}

function ComparisonDisplay({ change }: { change: number | null }) {
    if (change === null) return <p className="text-sm text-neutral-500 text-center py-4">Not enough data to compare.</p>;
    const isUp = change > 0;
    const isDown = change < 0;
    const colorClass = isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-neutral-400';
    const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
    return (
        <div className={`flex items-center gap-2 ${colorClass}`}>
            <Icon className="w-5 h-5" />
            <span className="text-2xl font-bold">{Math.abs(Math.round(change))}%</span>
            <span className="text-base font-semibold mt-1">{isUp ? 'Up' : isDown ? 'Down' : 'Same'}</span>
        </div>
    );
}

const daysOfWeek = [ { label: 'S', value: 'Sun' }, { label: 'M', value: 'Mon' }, { label: 'T', value: 'Tue' }, { label: 'W', value: 'Wed' }, { label: 'T', value: 'Thu' }, { label: 'F', value: 'Fri' }, { label: 'S', value: 'Sat' } ];

function CreateSessionModal({ isOpen, onClose, onSessionCreated }: { isOpen: boolean; onClose: () => void; onSessionCreated: () => void; }) {
    const [taskName, setTaskName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [duration, setDuration] = useState(45);
    const [isRepeating, setIsRepeating] = useState(false);
    const [repeatDays, setRepeatDays] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { user } = useAuth();

    const handleDayClick = (dayValue: string) => { setRepeatDays(prev => prev.includes(dayValue) ? prev.filter(d => d !== dayValue) : [...prev, dayValue]); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setError('');
        setLoading(true);
        try {
            if (isRepeating) {
                if (repeatDays.length === 0) throw new Error("Please select at least one day for repeating sessions.");
                if (!startTime) throw new Error("Please select a time for the repeating session.");
                const { error: insertError } = await supabase.from('repeating_sessions').insert({ user_id: user.id, task_name: taskName, duration_minutes: duration, scheduled_time: startTime, repeat_days: repeatDays });
                if (insertError) throw insertError;
            } else {
                const scheduledStart = new Date(`${startDate}T${startTime}`);
                if (scheduledStart <= new Date()) throw new Error('Session must be scheduled in the future');
                const { error: insertError } = await supabase.from('sessions').insert({ user_id: user.id, task_name: taskName, scheduled_start: scheduledStart.toISOString(), duration_minutes: duration, status: 'scheduled' });
                if (insertError) throw insertError;
            }
            setTaskName(''); setStartDate(''); setStartTime(''); setDuration(45); setIsRepeating(false); setRepeatDays([]);
            onSessionCreated();
        } catch (err: any) {
            setError(`Failed to create session: ${err.message || 'An unknown error occurred.'}`);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;
    const getLocalTodayString = () => { const today = new Date(); const year = today.getFullYear(); const month = String(today.getMonth() + 1).padStart(2, '0'); const day = String(today.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; };
    const today = getLocalTodayString();

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-6 w-full max-w-md border border-white/10">
                <div className="flex items-center justify-between mb-6"> <h2 className="text-2xl font-bold text-white">New Session</h2> <button onClick={onClose} className="text-neutral-400 hover:text-white transition"> <X className="w-6 h-6" /> </button> </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div> <label className="block text-sm font-medium text-neutral-300 mb-1">Task Name</label> <input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} required className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none placeholder-neutral-500 transition" placeholder="e.g., Math Homework" /> </div>
                    <div className="flex items-center justify-between bg-white/5 p-1 rounded-lg"> <label className="text-sm font-medium text-neutral-300 ml-2">Repeat Session</label> <button type="button" onClick={() => setIsRepeating(prev => !prev)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isRepeating ? 'bg-[#5F85DB]' : 'bg-neutral-600'}`}> <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRepeating ? 'translate-x-6' : 'translate-x-1'}`} /> </button> </div>
                    {isRepeating ? ( <div> <label className="block text-sm font-medium text-neutral-300 mb-1">Repeat on</label> <div className="flex justify-between gap-1"> {daysOfWeek.map((day) => ( <button key={day.value} type="button" onClick={() => handleDayClick(day.value)} className={`w-9 h-9 rounded-full font-bold text-sm transition-colors ${repeatDays.includes(day.value) ? 'bg-[#90B8F8] text-black' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}> {day.label} </button> ))} </div> </div> ) : ( <div className="grid grid-cols-2 gap-4"> <div> <label className="block text-sm font-medium text-neutral-300 mb-1">Date</label> <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={today} required={!isRepeating} className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none [color-scheme:dark] transition" /> </div> <div> <label className="block text-sm font-medium text-neutral-300 mb-1">Time</label> <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none [color-scheme:dark] transition" /> </div> </div> )}
                    {isRepeating && ( <div> <label className="block text-sm font-medium text-neutral-300 mb-1">Time</label> <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none [color-scheme:dark] transition" /> </div> )}
                    <div> <label className="block text-sm font-medium text-neutral-300 mb-1"> Duration (minutes) </label> <input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} min={1} max={300} className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none mt-2 placeholder-neutral-500 transition" placeholder="Enter duration in minutes" /> </div>
                    {error && ( <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-lg text-sm"> {error} </div> )}
                    {!isRepeating && ( <div className="flex items-start gap-3 text-neutral-400 text-sm pt-2"> <Info className="w-5 h-5 shrink-0 mt-0.5 text-[#5F85DB]" /> <span> <span className="font-semibold text-neutral-300">Heads up:</span> Once a session is created, it cannot be edited. Commit. </span> </div> )}
                    <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] text-white py-3 rounded-lg font-bold transition-all duration-300 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-2"> {loading ? 'Creating...' : 'Create Session'} </button>
                </form>
            </div>
        </div>
    );
}

// --- Helper Functions for Date Calculations ---
const calculateAverageOnDate = (logs: SessionLog[], targetDate: Date): number | null => { const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0); const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999); const filteredLogs = logs.filter(log => { const logDate = new Date(log.created_at); return logDate >= startOfDay && logDate <= endOfDay; }); if (filteredLogs.length === 0) return null; return filteredLogs.reduce((sum, l) => sum + l.productivity_score, 0) / filteredLogs.length; };
const calculateAverageInRange = (logs: SessionLog[], startDate: Date, endDate: Date): number | null => { const filteredLogs = logs.filter(log => new Date(log.created_at) >= startDate && new Date(log.created_at) <= endDate); if (filteredLogs.length === 0) return null; return filteredLogs.reduce((sum, l) => sum + l.productivity_score, 0) / filteredLogs.length; };
const calculateDailyAverages = (logs: SessionLog[], today: Date) => { const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1); return { todayAvg: calculateAverageOnDate(logs, today), yesterdayAvg: calculateAverageOnDate(logs, yesterday) }; };
const calculateWeeklyAverages = (logs: SessionLog[], today: Date) => { const endOfThisWeek = new Date(today); const startOfThisWeek = new Date(today); startOfThisWeek.setDate(today.getDate() - 6); const endOfLastWeek = new Date(startOfThisWeek); endOfLastWeek.setDate(startOfThisWeek.getDate() - 1); const startOfLastWeek = new Date(endOfLastWeek); startOfLastWeek.setDate(endOfLastWeek.getDate() - 6); return { thisWeekAvg: calculateAverageInRange(logs, startOfThisWeek, endOfThisWeek), lastWeekAvg: calculateAverageInRange(logs, startOfLastWeek, endOfLastWeek) }; };
const calculateMonthlyAverages = (logs: SessionLog[], today: Date) => { const endOfThisMonth = new Date(today); const startOfThisMonth = new Date(today); startOfThisMonth.setDate(today.getDate() - 29); const endOfLastMonth = new Date(startOfThisMonth); endOfLastMonth.setDate(startOfThisMonth.getDate() - 1); const startOfLastMonth = new Date(endOfLastMonth); startOfLastMonth.setDate(endOfLastMonth.getDate() - 29); return { thisMonthAvg: calculateAverageInRange(logs, startOfThisMonth, endOfThisMonth), lastMonthAvg: calculateAverageInRange(logs, startOfLastMonth, endOfLastMonth) }; };