import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    Clock,
    Target,
    CheckCircle,
    Trophy,
    ChevronDown,
    ChevronUp,
    Clock4,
    Zap,
    Star,
    Calendar,
    LineChart as LineChartIcon,
    BarChart2,
} from 'lucide-react';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Area,
    BarChart,
    Bar,
    Cell
} from 'recharts';

// --- Interfaces ---
interface SessionLog {
    productivity_score: number;
    start_delay_minutes: number;
    completion_percentage: number;
    created_at: string;
    actual_start: string;
}

interface UserStats {
    current_streak: number;
    longest_streak: number;
    total_sessions: number;
    total_on_time: number;
    total_completed: number;
    average_score: number;
}

interface Achievement {
    achievement_name: string;
    description: string | null;
    earned_at: string;
}

type ProgressView = 'week' | 'month' | 'year';

// --- Main YourJourney Component ---
// --- Main YourJourney Component ---
export function YourJourney() {
    const [logs, setLogs] = useState<SessionLog[]>([]);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAchievements, setShowAchievements] = useState(true);
    const { user } = useAuth();
    const [progressView, setProgressView] = useState<ProgressView>('week');

    useEffect(() => {
        if (user) loadAnalytics();
    }, [user]);

    const loadAnalytics = async () => {
        if (!user) return;
        setLoading(true);

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const [logsResult, statsResult, achievementsResult] = await Promise.all([
            supabase.from('session_logs').select('productivity_score, start_delay_minutes, completion_percentage, created_at, actual_start').eq('user_id', user.id).gte('created_at', oneYearAgo.toISOString()).order('created_at', { ascending: false }),
            supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
            supabase.from('achievements').select('achievement_name, description, earned_at').eq('user_id', user.id).order('earned_at', { ascending: false }),
        ]);

        if (logsResult.data) setLogs(logsResult.data);
        if (statsResult.data) setStats(statsResult.data);
        if (achievementsResult.data) setAchievements(achievementsResult.data);

        setLoading(false);
    };

    if (loading) {
        return <div className="text-center py-12 text-[#5F85DB] animate-pulse">Loading your journey...</div>;
    }

    // --- Data Processing Functions ---
    const getProgressData = (view: ProgressView) => {
        const days = view === 'week' ? 7 : view === 'month' ? 30 : 365;
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        const relevantLogs = logs.filter(log => new Date(log.created_at) >= sinceDate);
    
        const dataMap = new Map<string, { totalScore: number; count: number }>();
        const aggregationUnit = view === 'year' ? 'week' : 'day';
    
        relevantLogs.forEach(log => {
            const logDate = new Date(log.created_at);
            let key = '';
    
            if (aggregationUnit === 'week') {
                const dayOfWeek = logDate.getDay();
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const monday = new Date(logDate);
                monday.setHours(0, 0, 0, 0);
                monday.setDate(logDate.getDate() + mondayOffset);
                key = monday.toISOString().split('T')[0];
            } else { // 'day'
                key = logDate.toISOString().split('T')[0];
            }
    
            if (!dataMap.has(key)) dataMap.set(key, { totalScore: 0, count: 0 });
            const entry = dataMap.get(key)!;
            entry.totalScore += log.productivity_score;
            entry.count++;
        });
    
        const sortedEntries = Array.from(dataMap.entries()).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
    
        let processedData = sortedEntries.map(([key, values]) => ({
            avg: Math.round(values.totalScore / values.count),
            label: '' 
        }));
    
        const targetLength = view === 'year' ? 52 : days;
        while (processedData.length < targetLength) {
            processedData.push({ avg: null, label: '' });
        }
    
        return processedData;
    };

    const getProductivityByHour = () => {
        const hourlyData: { [key: number]: { totalScore: number; count: number } } = {};
        logs.forEach((log) => {
            const hour = new Date(log.actual_start).getHours();
            if (!hourlyData[hour]) hourlyData[hour] = { totalScore: 0, count: 0 };
            hourlyData[hour].totalScore += log.productivity_score;
            hourlyData[hour].count++;
        });
        return Array.from({ length: 24 }, (_, i) => {
            const data = hourlyData[i];
            if (!data || data.count === 0) return { hour: i, avgScore: null }; // Null for no data
            const avgScore = Math.round(data.totalScore / data.count);
            return { hour: i, avgScore: avgScore };
        });
    };
    
    const progressChartData = getProgressData(progressView);
    const progressChartTitle = `Your ${progressView === 'week' ? '7-Day' : progressView === 'month' ? '30-Day' : '1-Year'} Progress`;
    const productivityByHourData = getProductivityByHour();

    // --- MODIFICATION START ---
    // This logic now creates an array of exactly 7 items.
    // If a session log exists, it's used; otherwise, the score is set to null, creating an empty space.
    const recentLogs = logs.slice(0, 7).reverse(); 
    const recentSessionsData = Array.from({ length: 7 }, (_, i) => {
        const log = recentLogs[i];
        return {
            score: log ? log.productivity_score : null,
            label: i + 1 
        };
    });
    // --- MODIFICATION END ---

    // Determine progress trend for chart color
    const firstDataPoint = progressChartData.find(d => d.avg !== null)?.avg;
    const lastDataPoint = [...progressChartData].reverse().find(d => d.avg !== null)?.avg;
    let trend = 'neutral';
    if (typeof firstDataPoint === 'number' && typeof lastDataPoint === 'number' && progressChartData.filter(d => d.avg !== null).length > 1) {
        if (lastDataPoint > firstDataPoint) trend = 'upward';
        else if (lastDataPoint < firstDataPoint) trend = 'downward';
    }
    const trendColor = trend === 'upward' ? '#22c55e' : trend === 'downward' ? '#ef4444' : '#60a5fa'; // Green, Red, Blue


    // --- Analytics Calculations ---
    const today = new Date();
    const dayOfWeek = today.getDay(); // Sunday - 0, Monday - 1, ..., Saturday - 6
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); // Adjust to Monday
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeeksLogs = logs.filter(log => new Date(log.created_at) >= startOfWeek);
    
    // Calculate raw values, using null when there is not enough info
    const thisWeeksAverageRaw = thisWeeksLogs.length > 0 ? Math.round(thisWeeksLogs.reduce((sum, log) => sum + log.productivity_score, 0) / thisWeeksLogs.length) : null;
    const completionRateRaw = stats && stats.total_sessions > 0 ? Math.round((stats.total_completed / stats.total_sessions) * 100) : null;
    const onTimeRateRaw = stats && stats.total_sessions > 0 ? Math.round((stats.total_on_time / stats.total_sessions) * 100) : null;

    // Other stats calculations
    const perfectSessions = logs.filter(log => log.productivity_score === 100).length;
    const averageDelay = logs.length > 0 ? Math.round(logs.reduce((sum, log) => sum + log.start_delay_minutes, 0) / logs.length) : 0;
    
    const bestPerformingHour = productivityByHourData.reduce((prev, current) => (current.avgScore !== null && (prev.avgScore === null || current.avgScore > prev.avgScore)) ? current : prev, { hour: -1, avgScore: null });

    let productiveHourString = '';
    if (bestPerformingHour.avgScore !== null && bestPerformingHour.avgScore > 0) {
        const hour24 = bestPerformingHour.hour;
        const ampm = hour24 >= 12 ? 'PM' : 'AM';
        let displayHour = hour24 % 12;
        if (displayHour === 0) displayHour = 12;
        productiveHourString = `${displayHour} ${ampm}`;
    }

    const getScoreTextColor = (score: number): string => {
        if (score < 60) return 'text-red-400';
        if (score < 80) return 'text-blue-400';
        return 'text-green-400';
    };

    const getScoreFillColor = (score: number | null): string => {
        if (score === null) return 'transparent';
        if (score < 60) return '#ef4444';
        if (score < 80) return '#5F85DB';
        return '#22c55e';
    };
    
    const tooltipStyle = {
        backgroundColor: 'rgba(28, 28, 30, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        color: '#f5f5f5',
        borderRadius: '0.75rem',
        backdropFilter: 'blur(4px)',
    };

    const progressTickFormatter = (value: any, index: number) => {
        const totalPoints = progressChartData.length;
        if (totalPoints < 1) return '';

        const isFirst = index === 0;
        const isMiddle = index === Math.floor((totalPoints - 1) / 2);
        const isLast = index === totalPoints - 1;

        if (!isFirst && !isMiddle && !isLast) {
            return '';
        }

        const today = new Date();
        const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const formatMonthYear = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        if (progressView === 'week') {
            if (isFirst) {
                const date = new Date();
                date.setDate(today.getDate() - 6);
                return formatDate(date);
            }
            if (isMiddle) {
                const date = new Date();
                date.setDate(today.getDate() - 3);
                return formatDate(date);
            }
            if (isLast) return formatDate(today);
        }
        if (progressView === 'month') {
            if (isFirst) {
                const date = new Date();
                date.setDate(today.getDate() - 29);
                return formatDate(date);
            }
            if (isMiddle) {
                const date = new Date();
                date.setDate(today.getDate() - 15);
                return formatDate(date);
            }
            if (isLast) return formatDate(today);
        }
        if (progressView === 'year') {
            if (isFirst) {
                const date = new Date();
                date.setFullYear(today.getFullYear() - 1);
                return formatMonthYear(date);
            }
            if (isMiddle) {
                const date = new Date();
                date.setMonth(today.getMonth() - 6);
                return formatMonthYear(date);
            }
            if (isLast) return formatMonthYear(today);
        }

        return '';
    };

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <AnalyticsStatCard
                    icon={<CheckCircle className="w-5 h-5 text-[#5F85DB]" />}
                    title="On-Time Rate"
                    value={onTimeRateRaw !== null ? `${onTimeRateRaw}%` : '-'}
                    valueColor={onTimeRateRaw !== null ? getScoreTextColor(onTimeRateRaw) : undefined}
                />
                <AnalyticsStatCard
                    icon={<Target className="w-5 h-5 text-[#5F85DB]" />}
                    title="Completion Rate"
                    value={completionRateRaw !== null ? `${completionRateRaw}%` : '-'}
                    valueColor={completionRateRaw !== null ? getScoreTextColor(completionRateRaw) : undefined}
                />
                <AnalyticsStatCard
                    icon={<Calendar className="w-5 h-5 text-[#5F85DB]" />}
                    title="This Week's Average"
                    value={thisWeeksAverageRaw !== null ? `${thisWeeksAverageRaw}%` : '-'}
                    valueColor={thisWeeksAverageRaw !== null ? getScoreTextColor(thisWeeksAverageRaw) : undefined}
                />
                <AnalyticsStatCard icon={<Clock4 className="w-5 h-5 text-[#5F85DB]" />} title="Avg Delay" value={`${averageDelay}m`} />
                <AnalyticsStatCard icon={<Trophy className="w-5 h-5 text-[#5F85DB]" />} title="Longest Streak" value={stats?.longest_streak || 0} />
                <AnalyticsStatCard icon={<Star className="w-5 h-5 text-[#5F85DB]" />} title="Perfect Sessions" value={perfectSessions} />
            </div>

            <div className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                    <h2 className="flex items-center gap-3 text-lg font-bold text-white">
                        <LineChartIcon className="text-[#5F85DB]" />
                        {progressChartTitle}
                    </h2>
                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg self-start sm:self-center">
                        <button onClick={() => setProgressView('week')} className={`px-3 py-1 text-sm font-semibold rounded-md transition ${progressView === 'week' ? 'bg-[#5F85DB] text-white' : 'text-neutral-300 hover:text-white'}`}>Week</button>
                        <button onClick={() => setProgressView('month')} className={`px-3 py-1 text-sm font-semibold rounded-md transition ${progressView === 'month' ? 'bg-[#5F85DB] text-white' : 'text-neutral-300 hover:text-white'}`}>Month</button>
                        <button onClick={() => setProgressView('year')} className={`px-3 py-1 text-sm font-semibold rounded-md transition ${progressView === 'year' ? 'bg-[#5F85DB] text-white' : 'text-neutral-300 hover:text-white'}`}>Year</button>
                    </div>
                </div>

                {progressChartData.some((d) => d.avg !== null) ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={progressChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                             <defs>
                                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={trendColor} stopOpacity={0.4}/>
                                <stop offset="95%" stopColor={trendColor} stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="label" stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} tickFormatter={progressTickFormatter} interval={0} />
                            <YAxis stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                formatter={(value: number) => [`${value}%`, 'Avg Score']}
                                labelStyle={{ fontWeight: 'bold' }}
                            />
                            <Area type="monotone" dataKey="avg" stroke={trendColor} fillOpacity={1} fill="url(#trendGradient)" connectNulls={false} />
                            <Line type="monotone" dataKey="avg" stroke={trendColor} strokeWidth={2} dot={false} connectNulls={false} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-neutral-500">Log a session to see your progress chart.</div>
                )}
            </div>

            <div className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                <h2 className="flex items-center gap-3 text-lg font-bold text-white"><Clock className="text-[#5F85DB]" />Your Power Hours</h2>
                <p className="text-neutral-400 mt-1 mb-6">Average scores by hour.</p>
                {logs.length > 0 ? (
                    <>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={productivityByHourData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                                <XAxis dataKey="hour" stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} interval={1} tickFormatter={(hour) => { const h = hour % 12; return h === 0 ? 12 : h; }} />
                                <YAxis stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(95, 133, 219, 0.1)' }}
                                    contentStyle={tooltipStyle}
                                    labelFormatter={(hour) => { const ampm = hour >= 12 ? 'PM' : 'AM'; let displayHour = hour % 12; if (displayHour === 0) displayHour = 12; return `${displayHour}:00 ${ampm}`; }}
                                    formatter={(value: number) => value === null ? ['No Data', ''] : [`${value}%`, 'Avg Score']}
                                />
                                <Bar dataKey="avgScore" radius={[4, 4, 0, 0]} minPointSize={2}>
                                    {productivityByHourData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={getScoreFillColor(entry.avgScore)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        {productiveHourString && (
                            <div className="text-center text-neutral-400 text-sm mt-4 flex items-center justify-center gap-2">
                                <Zap className="w-4 h-4 text-[#5F85DB]" />
                                You're most productive at: <span className="font-bold text-neutral-200">{productiveHourString}</span>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="h-64 flex items-center justify-center text-neutral-500">No session data to display hourly productivity.</div>
                )}
            </div>
            
            <div className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                <h2 className="flex items-center gap-3 text-lg font-bold text-white"><BarChart2 className="text-[#5F85DB]" />Recent Sessions</h2>
                <p className="text-neutral-400 mt-1 mb-6">Last 7 session scores.</p>
                {recentSessionsData.some(session => session.score !== null) ? ( // --- MODIFICATION: Check if there's at least one completed session to show the chart
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={recentSessionsData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                            <XAxis dataKey="label" stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <Tooltip
                                cursor={{ fill: 'rgba(95, 133, 219, 0.1)' }}
                                contentStyle={tooltipStyle}
                                labelFormatter={(label) => `Session ${label}`}
                                // --- MODIFICATION START ---
                                // Update formatter to handle null values for sessions that haven't happened.
                                formatter={(value: number | null) => value === null ? ['No Data', ''] : [`${value}%`, 'Score']}
                                // --- MODIFICATION END ---
                            />
                            <Bar dataKey="score" radius={[4, 4, 0, 0]} minPointSize={2}>
                                {recentSessionsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={getScoreFillColor(entry.score)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-64 flex items-center justify-center text-neutral-500">Complete sessions to see your recent history.</div>
                )}
            </div>
            
            {achievements.length > 0 && (
                <div className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                    <button onClick={() => setShowAchievements((v) => !v)} className="flex items-center justify-between w-full text-left mb-4">
                        <h2 className="flex items-center gap-3 text-lg font-bold text-white"><Trophy className="text-[#5F85DB]" />Your Trophy Case</h2>
                        {showAchievements ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
                    </button>
                    {showAchievements && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {achievements.map((ach, index) => (
                                <div key={index} className="bg-white/5 border border-white/10 p-4 rounded-xl">
                                    <h4 className="font-bold text-white mb-1">{ach.achievement_name}</h4>
                                    {ach.description && <p className="text-sm text-neutral-400 mb-2">{ach.description}</p>}
                                    <p className="text-xs text-neutral-500">Earned on: {new Date(ach.earned_at).toLocaleDateString()}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function AnalyticsStatCard({ icon, title, value, valueColor }: { icon: JSX.Element; title: string; value: string | number; valueColor?: string; }) {
    return (
        <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-5 border border-white/10 flex flex-col justify-between transition-all duration-300 hover:border-white/20 hover:scale-[1.02]">
            <div className="flex items-center gap-3 mb-2">
                <div className="bg-[#26282B] p-2 rounded-lg">{icon}</div>
                <span className="text-sm font-medium text-neutral-300">{title}</span>
            </div>
            <p className={`text-3xl font-bold ${valueColor || 'text-white'}`}>{value}</p>
        </div>
    );
}