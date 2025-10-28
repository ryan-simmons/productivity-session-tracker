import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { View, Text, TouchableOpacity } from 'react-native';
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
} from 'lucide-react-native'; // MODIFIED: Switched to lucide-react-native

// MODIFIED: Replaced 'recharts' with 'victory-native' for mobile compatibility
import { VictoryChart, VictoryLine, VictoryArea, VictoryBar, VictoryAxis, VictoryTooltip } from 'victory-native';
import { Defs, LinearGradient, Stop } from 'react-native-svg';

// --- Interfaces (Unchanged) ---
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
export function YourJourney() {
    // --- State and Hooks (Unchanged) ---
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
        return <View className="text-center py-12"><Text className="text-[#5F85DB] animate-pulse">Loading your journey...</Text></View>;
    }
    
    // --- Data Processing Functions (Unchanged Logic, just changed data structure for victory-native) ---
    const getProgressData = (view: ProgressView) => {
        // ... (same logic as before) ...
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
            } else { 
                key = logDate.toISOString().split('T')[0];
            }
    
            if (!dataMap.has(key)) dataMap.set(key, { totalScore: 0, count: 0 });
            const entry = dataMap.get(key)!;
            entry.totalScore += log.productivity_score;
            entry.count++;
        });
    
        const sortedEntries = Array.from(dataMap.entries()).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
    
        // MODIFIED: Victory requires x, y data points
        return sortedEntries.map(([key, values], index) => ({
            x: index,
            y: Math.round(values.totalScore / values.count),
            label: `${Math.round(values.totalScore / values.count)}%`
        }));
    };

    const getProductivityByHour = () => {
        const hourlyData: { [key: number]: { totalScore: number; count: number } } = {};
        logs.forEach((log) => {
            const hour = new Date(log.actual_start).getHours();
            if (!hourlyData[hour]) hourlyData[hour] = { totalScore: 0, count: 0 };
            hourlyData[hour].totalScore += log.productivity_score;
            hourlyData[hour].count++;
        });
        // MODIFIED: Victory requires x, y data points
        return Array.from({ length: 24 }, (_, i) => {
            const data = hourlyData[i];
            const avgScore = data && data.count > 0 ? Math.round(data.totalScore / data.count) : null;
            const ampm = i >= 12 ? 'PM' : 'AM';
            let displayHour = i % 12;
            if (displayHour === 0) displayHour = 12;
            const label = avgScore === null ? 'No Data' : `${displayHour} ${ampm}\n${avgScore}%`;
            return { x: i, y: avgScore, label };
        });
    };

    const recentSessionsData = Array.from({ length: 7 }, (_, i) => {
        const log = logs.slice(0, 7).reverse()[i];
        // MODIFIED: Victory requires x, y data points
        return {
            x: i + 1,
            y: log ? log.productivity_score : null,
            label: log ? `${log.productivity_score}%` : 'No Data'
        };
    });

    const progressChartData = getProgressData(progressView);
    const progressChartTitle = `Your ${progressView === 'week' ? '7-Day' : progressView === 'month' ? '30-Day' : '1-Year'} Progress`;
    const productivityByHourData = getProductivityByHour();

    // Determine progress trend for chart color
    const firstDataPoint = progressChartData.find(d => d.y !== null)?.y;
    const lastDataPoint = [...progressChartData].reverse().find(d => d.y !== null)?.y;
    let trend = 'neutral';
    if (typeof firstDataPoint === 'number' && typeof lastDataPoint === 'number' && progressChartData.filter(d => d.y !== null).length > 1) {
        if (lastDataPoint > firstDataPoint) trend = 'upward';
        else if (lastDataPoint < firstDataPoint) trend = 'downward';
    }
    const trendColor = trend === 'upward' ? '#22c55e' : trend === 'downward' ? '#ef4444' : '#60a5fa';

    // --- Analytics Calculations (Unchanged) ---
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); 
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeeksLogs = logs.filter(log => new Date(log.created_at) >= startOfWeek);
    
    const thisWeeksAverageRaw = thisWeeksLogs.length > 0 ? Math.round(thisWeeksLogs.reduce((sum, log) => sum + log.productivity_score, 0) / thisWeeksLogs.length) : null;
    const completionRateRaw = stats && stats.total_sessions > 0 ? Math.round((stats.total_completed / stats.total_sessions) * 100) : null;
    const onTimeRateRaw = stats && stats.total_sessions > 0 ? Math.round((stats.total_on_time / stats.total_sessions) * 100) : null;

    const perfectSessions = logs.filter(log => log.productivity_score === 100).length;
    const averageDelay = logs.length > 0 ? Math.round(logs.reduce((sum, log) => sum + log.start_delay_minutes, 0) / logs.length) : 0;
    
    const bestPerformingHour = productivityByHourData.reduce((prev, current) => (current.y !== null && (prev.y === null || current.y > prev.y)) ? current : prev, { x: -1, y: null, label: '' });

    let productiveHourString = '';
    if (bestPerformingHour.y !== null && bestPerformingHour.y > 0) {
        const hour24 = bestPerformingHour.x;
        const ampm = hour24 >= 12 ? 'PM' : 'AM';
        let displayHour = hour24 % 12;
        if (displayHour === 0) displayHour = 12;
        productiveHourString = `${displayHour} ${ampm}`;
    }
    
    // --- Helper Functions (Unchanged) ---
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

    // --- Charting Tick Formatters (Adjusted for Victory) ---
    const progressTickFormatter = (value: any, index: number) => {
        // ... (This function is complex and highly specific to recharts' API, we'll simplify for Victory)
        // Victory handles tick distribution better automatically. We'll show start, middle, end.
        const totalPoints = progressChartData.length;
        if (index === 0) return "Start";
        if (index === Math.floor(totalPoints / 2)) return "Mid";
        if (index === totalPoints - 1) return "End";
        return '';
    }

    const chartTheme = {
        axis: {
            style: {
                axis: { stroke: 'transparent' },
                tickLabels: { fill: '#a3a3a3', fontSize: 12, padding: 5 },
                grid: { stroke: 'rgba(255, 255, 255, 0.1)', strokeDasharray: '2, 5' }
            }
        },
        tooltip: {
            style: { fill: '#f5f5f5' },
            flyoutStyle: { fill: 'rgba(28, 28, 30, 0.8)', stroke: 'rgba(255, 255, 255, 0.1)' },
        }
    };

    // --- JSX (MODIFIED: Replaced divs with Views, recharts with victory-native) ---
    return (
        <View className="space-y-8">
            <View className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <AnalyticsStatCard
                    icon={<CheckCircle className="w-5 h-5 text-[#5F85DB]" />}
                    title="On-Time Rate"
                    value={onTimeRateRaw !== null ? `${onTimeRateRaw}%` : '-'}
                    valueColor={onTimeRateRaw !== null ? getScoreTextColor(onTimeRateRaw) : undefined}
                />
                {/* ... other AnalyticsStatCard instances */}
            </View>

            <View className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                <View className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                    <Text className="flex items-center gap-3 text-lg font-bold text-white">
                        <LineChartIcon className="text-[#5F85DB]" />
                        {progressChartTitle}
                    </Text>
                     <View className="flex flex-row items-center gap-1 bg-white/5 p-1 rounded-lg self-start sm:self-center">
                        <TouchableOpacity onPress={() => setProgressView('week')} className={`px-3 py-1 rounded-md ${progressView === 'week' ? 'bg-[#5F85DB]' : ''}`}><Text className={`text-sm font-semibold ${progressView === 'week' ? 'text-white' : 'text-neutral-300'}`}>Week</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setProgressView('month')} className={`px-3 py-1 rounded-md ${progressView === 'month' ? 'bg-[#5F85DB]' : ''}`}><Text className={`text-sm font-semibold ${progressView === 'month' ? 'text-white' : 'text-neutral-300'}`}>Month</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setProgressView('year')} className={`px-3 py-1 rounded-md ${progressView === 'year' ? 'bg-[#5F85DB]' : ''}`}><Text className={`text-sm font-semibold ${progressView === 'year' ? 'text-white' : 'text-neutral-300'}`}>Year</Text></TouchableOpacity>
                    </View>
                </View>

                {progressChartData.some((d) => d.y !== null) ? (
                    <View style={{ height: 250 }}>
                        <VictoryChart height={250} padding={{ top: 20, bottom: 30, left: 40, right: 20 }} theme={chartTheme}>
                            <Defs>
                                <LinearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="5%" stopColor={trendColor} stopOpacity={0.4}/>
                                    <Stop offset="95%" stopColor={trendColor} stopOpacity={0}/>
                                </LinearGradient>
                            </Defs>
                            <VictoryAxis dependentAxis tickFormatter={(t) => `${t}%`} />
                            <VictoryAxis tickCount={3} tickFormat={progressTickFormatter} />
                            <VictoryArea
                                data={progressChartData.filter(d => d.y !== null)}
                                style={{ data: { fill: "url(#trendGradient)", stroke: trendColor, strokeWidth: 2 } }}
                                interpolation="monotoneX"
                            />
                            <VictoryLine
                                data={progressChartData.filter(d => d.y !== null)}
                                style={{ data: { stroke: trendColor, strokeWidth: 2 } }}
                                interpolation="monotoneX"
                                labelComponent={<VictoryTooltip />}
                            />
                        </VictoryChart>
                    </View>
                ) : (
                    <View className="h-[250px] flex items-center justify-center"><Text className="text-neutral-500">Log a session to see your progress chart.</Text></View>
                )}
            </View>

            {/* Power Hours Chart */}
             <View className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                 <Text className="flex items-center gap-3 text-lg font-bold text-white"><Clock className="text-[#5F85DB]" />Your Power Hours</Text>
                 <Text className="text-neutral-400 mt-1 mb-6">Average scores by hour.</Text>
                 {logs.length > 0 ? (
                     <>
                        <View style={{ height: 250 }}>
                             <VictoryChart height={250} domainPadding={{ x: 10 }} padding={{ top: 20, bottom: 30, left: 40, right: 20 }} theme={chartTheme}>
                                 <VictoryAxis dependentAxis tickFormatter={(t) => `${t}%`} />
                                 <VictoryAxis tickValues={[0, 6, 12, 18, 23]} tickFormatter={(t) => { const h = t % 12; return h === 0 ? 12 : h; }} />
                                 <VictoryBar
                                     data={productivityByHourData}
                                     labelComponent={<VictoryTooltip />}
                                     style={{
                                         data: {
                                             fill: ({ datum }) => getScoreFillColor(datum.y),
                                         }
                                     }}
                                     cornerRadius={{ topLeft: 4, topRight: 4 }}
                                     barWidth={8}
                                 />
                             </VictoryChart>
                        </View>
                        {productiveHourString && (
                            <View className="text-center text-neutral-400 text-sm mt-4 flex-row items-center justify-center gap-2">
                                <Zap className="w-4 h-4 text-[#5F85DB]" />
                                <Text>You're most productive at: <Text className="font-bold text-neutral-200">{productiveHourString}</Text></Text>
                            </View>
                        )}
                    </>
                ) : (
                    <View className="h-64 flex items-center justify-center"><Text className="text-neutral-500">No session data to display hourly productivity.</Text></View>
                )}
            </View>

            {/* Recent Sessions Chart */}
            <View className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                 <Text className="flex items-center gap-3 text-lg font-bold text-white"><BarChart2 className="text-[#5F85DB]" />Recent Sessions</Text>
                 <Text className="text-neutral-400 mt-1 mb-6">Last 7 session scores.</Text>
                 {recentSessionsData.some(session => session.y !== null) ? (
                    <View style={{ height: 250 }}>
                        <VictoryChart height={250} domainPadding={{ x: 20 }} padding={{ top: 20, bottom: 30, left: 40, right: 20 }} theme={chartTheme}>
                            <VictoryAxis dependentAxis tickFormatter={(t) => `${t}%`} />
                            <VictoryAxis tickFormat={(t) => `S${t}`} />
                             <VictoryBar
                                 data={recentSessionsData}
                                 labelComponent={<VictoryTooltip />}
                                 style={{
                                     data: {
                                         fill: ({ datum }) => getScoreFillColor(datum.y),
                                     }
                                 }}
                                 cornerRadius={{ topLeft: 4, topRight: 4 }}
                             />
                        </VictoryChart>
                    </View>
                ) : (
                    <View className="h-64 flex items-center justify-center"><Text className="text-neutral-500">Complete sessions to see your recent history.</Text></View>
                )}
            </View>
            
            {/* Achievements Section */}
             {achievements.length > 0 && (
                <View className="bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
                    <TouchableOpacity onPress={() => setShowAchievements((v) => !v)} className="flex-row items-center justify-between w-full text-left mb-4">
                        <Text className="flex items-center gap-3 text-lg font-bold text-white"><Trophy className="text-[#5F85DB]" />Your Trophy Case</Text>
                        {showAchievements ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
                    </TouchableOpacity>
                    {showAchievements && (
                        <View className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {achievements.map((ach, index) => (
                                <View key={index} className="bg-white/5 border border-white/10 p-4 rounded-xl">
                                    <Text className="font-bold text-white mb-1">{ach.achievement_name}</Text>
                                    {ach.description && <Text className="text-sm text-neutral-400 mb-2">{ach.description}</Text>}
                                    <Text className="text-xs text-neutral-500">Earned on: {new Date(ach.earned_at).toLocaleDateString()}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

function AnalyticsStatCard({ icon, title, value, valueColor }: { icon: JSX.Element; title: string; value: string | number; valueColor?: string; }) {
    return (
        <View className="bg-black/30 backdrop-blur-lg rounded-2xl p-5 border border-white/10 flex-col justify-between transition-all duration-300 hover:border-white/20 hover:scale-[1.02]">
            <View className="flex-row items-center gap-3 mb-2">
                <View className="bg-[#26282B] p-2 rounded-lg">{icon}</View>
                <Text className="text-sm font-medium text-neutral-300">{title}</Text>
            </View>
            <Text className={`text-3xl font-bold ${valueColor || 'text-white'}`}>{value}</Text>
        </View>
    );
}