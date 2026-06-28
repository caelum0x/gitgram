import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import { snippetService, CreateSnippetData } from '../../services/snippetService';
import { logger } from '../../utils/logger';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
] as const;

interface FormErrors {
  title?: string;
  code?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

export default function CreateSnippetScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<string>('typescript');
  const [code, setCode] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = useCallback((): FormErrors => {
    const next: FormErrors = {};
    if (title.trim().length < 3) {
      next.title = 'Title must be at least 3 characters.';
    }
    if (code.trim().length === 0) {
      next.code = 'Code is required.';
    }
    return next;
  }, [title, code]);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload: CreateSnippetData = {
        title: title.trim(),
        description: description.trim() || undefined,
        language,
        code,
        isPublic,
      };
      const created = await snippetService.createSnippet(payload);
      const newId = created?.id ?? created?.snippet?.id;
      if (newId) {
        router.replace(`/snippets/${newId}`);
      } else {
        router.back();
      }
    } catch (error) {
      logger.error('Create snippet error:', error);
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [validate, title, description, language, code, isPublic, router]);

  return (
    <View style={styles.container}>
      <Header title="Create Snippet" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={[styles.input, errors.title && styles.inputError]}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Debounce hook in TypeScript"
          placeholderTextColor={Colors.muted}
          maxLength={120}
        />
        {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="Briefly describe what this snippet does"
          placeholderTextColor={Colors.muted}
          maxLength={300}
          multiline
        />

        <Text style={styles.label}>Language</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={LANGUAGES}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.languageRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, language === item.value && styles.chipActive]}
              onPress={() => setLanguage(item.value)}
            >
              <Text
                style={[styles.chipText, language === item.value && styles.chipTextActive]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        <Text style={styles.label}>Code</Text>
        <TextInput
          style={[styles.input, styles.codeInput, errors.code && styles.inputError]}
          value={code}
          onChangeText={setCode}
          placeholder={`// Paste or type your ${language} code here`}
          placeholderTextColor={Colors.muted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        {errors.code && <Text style={styles.errorText}>{errors.code}</Text>}

        <View style={styles.publicRow}>
          <View style={styles.publicLabel}>
            <Text style={styles.label}>Public</Text>
            <Text style={styles.hint}>
              {isPublic ? 'Anyone can view this snippet' : 'Only you can view this snippet'}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Publishing…' : 'Publish Snippet'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.foreground,
    marginBottom: 8,
    marginTop: 16,
  },
  hint: {
    fontSize: 12,
    color: Colors.muted,
    marginTop: 2,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.foreground,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  codeInput: {
    minHeight: 200,
    fontFamily: 'monospace',
    fontSize: 13,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.error,
  },
  languageRow: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: Colors.foreground,
  },
  chipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  publicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  publicLabel: {
    flex: 1,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
