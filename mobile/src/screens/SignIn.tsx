import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { COLORS } from "../../../src/mobile/theme";
import {
  appleSignInAvailable,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
} from "../auth/providers";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apple, setApple] = useState(false);

  useEffect(() => {
    void appleSignInAvailable().then(setApple);
  }, []);

  const attempt = async (sign: () => Promise<{ error: string | null }>) => {
    setBusy(true);
    setError(null);
    const result = await sign();
    setError(result.error);
    setBusy(false);
    // On success the session listener in useSession moves the app on, so there is nothing
    // to navigate to here. A screen that routed itself would race that listener.
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.plate} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Family Recipes</Text>
        <Text style={styles.body}>Sign in with the account you already have.</Text>

        <Text style={styles.label} nativeID="email-label">
          Email
        </Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          accessibilityLabelledBy="email-label"
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          editable={!busy}
        />

        <Text style={styles.label} nativeID="password-label">
          Password
        </Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          accessibilityLabelledBy="password-label"
          accessibilityLabel="Password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          editable={!busy}
        />

        {error !== null && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed, busy && styles.actionBusy]}
          onPress={() => void attempt(() => signInWithEmail(email, password))}
          disabled={busy || email.trim() === "" || password === ""}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={COLORS.onAction} /> : <Text style={styles.actionText}>Sign in</Text>}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.actionPressed]}
          onPress={() => void attempt(signInWithGoogle)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Continue with Google</Text>
        </Pressable>

        {apple && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={10}
            style={styles.apple}
            onPress={() => void attempt(signInWithApple)}
          />
        )}

        <Text style={styles.note}>
          New here? Accounts are made on the website, at enamelvault.com.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall },
  plate: { backgroundColor: COLORS.plate, borderRadius: 16, padding: 20, margin: 24, marginTop: 80 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "700", marginBottom: 4 },
  body: { color: COLORS.inkSoft, fontSize: 17, marginBottom: 16 },
  label: { color: COLORS.ink, fontSize: 15, fontWeight: "600", marginBottom: 4 },
  input: {
    backgroundColor: COLORS.plateAlt,
    borderRadius: 10,
    color: COLORS.ink,
    fontSize: 17,
    marginBottom: 12,
    padding: 12,
  },
  error: { color: COLORS.actionDeep, fontSize: 15, fontWeight: "600", marginBottom: 12 },
  action: {
    alignItems: "center",
    backgroundColor: COLORS.action,
    borderRadius: 10,
    marginTop: 4,
    minHeight: 48,
    justifyContent: "center",
    padding: 12,
  },
  actionPressed: { opacity: 0.85 },
  actionBusy: { opacity: 0.7 },
  actionText: { color: COLORS.onAction, fontSize: 17, fontWeight: "700" },
  secondary: {
    alignItems: "center",
    backgroundColor: COLORS.chip,
    borderRadius: 10,
    marginTop: 10,
    minHeight: 48,
    justifyContent: "center",
    padding: 12,
  },
  secondaryText: { color: COLORS.chipInk, fontSize: 17, fontWeight: "600" },
  apple: { height: 48, marginTop: 10 },
  note: { color: COLORS.inkSoft, fontSize: 15, marginTop: 16 },
});
