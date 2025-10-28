import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import YourIcon from '../assets/logov1.svg'; // MODIFIED: Simplified SVG import

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp, signIn } = useAuth();

  const handleSubmit = async () => { // MODIFIED: Removed event parameter
    setError('');
    setLoading(true);

    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    // MODIFIED: SafeAreaView is a good practice for screen components
    <SafeAreaView className="flex-1 items-center justify-center bg-[#111111] p-4">
      <View className="bg-black/30 backdrop-blur-lg p-8 rounded-2xl border border-white/10 w-full max-w-md">
        <View className="flex items-center justify-center mb-8">
          <YourIcon width={48} height={48} color="#90B8F8" />
        </View>

        <Text className="text-3xl font-bold text-center mb-2 text-white">
          Tymly
        </Text>
        <Text className="text-center text-neutral-300 mb-8">
          {isSignUp ? 'Create an account to get started' : 'Sign in to track your productivity'}
        </Text>

        <View className="space-y-4">
          <View>
            <Text className="block text-sm font-medium text-neutral-300 mb-1">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none transition placeholder-neutral-500"
              placeholder="you@example.com"
              placeholderTextColor="#a3a3a3"
            />
          </View>

          <View>
            <Text className="block text-sm font-medium text-neutral-300 mb-1">
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              className="w-full px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg focus:ring-2 focus:ring-[#5F85DB] outline-none transition placeholder-neutral-500"
              placeholder="••••••••"
              placeholderTextColor="#a3a3a3"
            />
          </View>

          {error && (
            <View className="bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-lg">
              <Text className="text-red-300 text-sm">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#5F85DB] to-[#90B8F8] py-3 rounded-lg transition-all duration-300 active:opacity-90 disabled:opacity-50"
          >
            <Text className="text-white font-bold text-center">
                {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-6 text-center">
          <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
            <Text className="text-[#5F85DB] active:text-[#90B8F8] text-sm font-medium transition text-center">
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}