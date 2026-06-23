import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { apiClient } from '../../../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors (matches repo detail screen)
// ---------------------------------------------------------------------------

const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  error: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  white: '#FFFFFF',
  draftYellow: '#F59E0B',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

interface BranchesResponse {
  branches: Branch[];
}

interface Label {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

interface LabelsResponse {
  labels: Label[];
}

interface Collaborator {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface CollaboratorsResponse {
  collaborators: Collaborator[];
}

interface CreatePrBody {
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
  labels: string[];
  assignees: string[];
}

interface PrCreatedResponse {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function labelTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return Colors.text;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? '#0F0F1A' : Colors.white;
}

function insertMarkdown(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
  suffix: string,
): { newText: string; newCursor: number } {
  const before = text.slice(0, selStart);
  const selected = text.slice(selStart, selEnd);
  const after = text.slice(selEnd);
  const newText = `${before}${prefix}${selected}${suffix}${after}`;
  const newCursor = selEnd + prefix.length + suffix.length;
  return { newText, newCursor };
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sectionHeaderStyles.container}>
      <Text style={sectionHeaderStyles.title}>{title}</Text>
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  title: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
});

// ---------------------------------------------------------------------------
// Branch picker modal
// ---------------------------------------------------------------------------

interface BranchPickerModalProps {
  visible: boolean;
  title: string;
  branches: Branch[];
  selected: string;
  onSelect: (branch: string) => void;
  onClose: () => void;
}

function BranchPickerModal({
  visible,
  title,
  branches,
  selected,
  onSelect,
  onClose,
}: BranchPickerModalProps) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? branches.filter((b) =>
        b.name.toLowerCase().includes(query.toLowerCase()),
      )
    : branches;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={modalStyles.safeArea}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={modalStyles.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={modalStyles.searchRow}>
          <TextInput
            style={modalStyles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Filter branches..."
            placeholderTextColor={Colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" style={modalStyles.list}>
          {filtered.map((branch) => {
            const isSelected = branch.name === selected;
            return (
              <Pressable
                key={branch.name}
                style={[
                  modalStyles.branchRow,
                  isSelected && modalStyles.branchRowSelected,
                ]}
                onPress={() => {
                  onSelect(branch.name);
                  onClose();
                }}
              >
                <View style={modalStyles.branchLeft}>
                  <Text style={modalStyles.branchIcon}>⎇</Text>
                  <Text
                    style={[
                      modalStyles.branchName,
                      isSelected && modalStyles.branchNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {branch.name}
                  </Text>
                  {branch.protected && (
                    <View style={modalStyles.protectedBadge}>
                      <Text style={modalStyles.protectedText}>protected</Text>
                    </View>
                  )}
                </View>
                {isSelected && (
                  <Text style={modalStyles.checkmark}>✓</Text>
                )}
              </Pressable>
            );
          })}

          {filtered.length === 0 && (
            <Text style={modalStyles.emptyText}>No branches match "{query}"</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  closeBtn: { color: Colors.primaryLight, fontSize: 15, fontWeight: '600' },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  list: { flex: 1 },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  branchRowSelected: { backgroundColor: Colors.surface },
  branchLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  branchIcon: { color: Colors.textMuted, fontSize: 13 },
  branchName: { color: Colors.text, fontSize: 14, fontFamily: 'monospace', flex: 1 },
  branchNameSelected: { color: Colors.primaryLight },
  protectedBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  protectedText: { color: Colors.textMuted, fontSize: 10 },
  checkmark: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
  },
});

// ---------------------------------------------------------------------------
// Markdown toolbar
// ---------------------------------------------------------------------------

interface ToolbarAction {
  label: string;
  prefix: string;
  suffix: string;
  description: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: 'B', prefix: '**', suffix: '**', description: 'Bold' },
  { label: 'I', prefix: '_', suffix: '_', description: 'Italic' },
  { label: '<>', prefix: '`', suffix: '`', description: 'Code' },
  { label: '[]', prefix: '[', suffix: '](url)', description: 'Link' },
  { label: '☑', prefix: '\n- [ ] ', suffix: '', description: 'Checklist' },
];

interface MarkdownToolbarProps {
  onAction: (prefix: string, suffix: string) => void;
}

function MarkdownToolbar({ onAction }: MarkdownToolbarProps) {
  return (
    <View style={toolbarStyles.container}>
      {TOOLBAR_ACTIONS.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={toolbarStyles.btn}
          onPress={() => onAction(action.prefix, action.suffix)}
          accessibilityLabel={action.description}
        >
          <Text style={toolbarStyles.btnText}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const toolbarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});

// ---------------------------------------------------------------------------
// Label chip
// ---------------------------------------------------------------------------

interface LabelChipProps {
  label: Label;
  selected: boolean;
  onToggle: (id: string) => void;
}

function LabelChip({ label, selected, onToggle }: LabelChipProps) {
  const bgColor = `#${label.color}`;
  const textColor = labelTextColor(label.color);
  return (
    <TouchableOpacity
      style={[
        labelChipStyles.chip,
        { backgroundColor: selected ? bgColor : Colors.surfaceElevated },
        selected && labelChipStyles.chipSelected,
      ]}
      onPress={() => onToggle(label.id)}
      accessibilityLabel={`${selected ? 'Remove' : 'Add'} label ${label.name}`}
    >
      <View
        style={[
          labelChipStyles.dot,
          { backgroundColor: selected ? textColor : bgColor },
        ]}
      />
      <Text
        style={[
          labelChipStyles.name,
          { color: selected ? textColor : Colors.text },
        ]}
      >
        {label.name}
      </Text>
    </TouchableOpacity>
  );
}

const labelChipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: { borderColor: 'transparent' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 12, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Assignee pill
// ---------------------------------------------------------------------------

interface AssigneePillProps {
  collaborator: Collaborator;
  selected: boolean;
  onToggle: (username: string) => void;
}

function AssigneePill({ collaborator, selected, onToggle }: AssigneePillProps) {
  const initial = (collaborator.displayName ?? collaborator.username)[0]
    ?.toUpperCase() ?? '?';
  return (
    <TouchableOpacity
      style={[
        assigneeStyles.pill,
        selected && assigneeStyles.pillSelected,
      ]}
      onPress={() => onToggle(collaborator.username)}
      accessibilityLabel={`${selected ? 'Remove' : 'Assign'} ${collaborator.username}`}
    >
      <View style={assigneeStyles.avatar}>
        <Text style={assigneeStyles.avatarInitial}>{initial}</Text>
      </View>
      <Text
        style={[assigneeStyles.name, selected && assigneeStyles.nameSelected]}
        numberOfLines={1}
      >
        {collaborator.displayName ?? collaborator.username}
      </Text>
      {selected && <Text style={assigneeStyles.check}>✓</Text>}
    </TouchableOpacity>
  );
}

const assigneeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 150,
  },
  pillSelected: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primary,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  name: { color: Colors.text, fontSize: 12, fontWeight: '500', flex: 1 },
  nameSelected: { color: Colors.primaryLight },
  check: { color: Colors.primaryLight, fontSize: 12, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CreatePrScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  // ----- Branch state -----
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [headBranch, setHeadBranch] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [headPickerOpen, setHeadPickerOpen] = useState(false);
  const [basePickerOpen, setBasePickerOpen] = useState(false);

  // ----- Form fields -----
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isDraft, setIsDraft] = useState(false);

  // ----- Labels -----
  const [labels, setLabels] = useState<Label[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(true);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());

  // ----- Assignees -----
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(true);
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [assigneeQuery, setAssigneeQuery] = useState('');

  // ----- Submit state -----
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ----- Markdown cursor for toolbar -----
  const [bodySelection, setBodySelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const bodyInputRef = useRef<TextInput>(null);

  // ----- Fetch branches -----
  useEffect(() => {
    if (!owner || !name) return;
    setBranchesLoading(true);
    apiClient<BranchesResponse>(
      `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`,
    )
      .then((data) => {
        const list = data.branches ?? [];
        setBranches(list);
        // Default: base = first branch (usually default), head = second
        if (list.length > 0) setBaseBranch(list[0].name);
        if (list.length > 1) setHeadBranch(list[1].name);
      })
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [owner, name]);

  // ----- Fetch labels -----
  useEffect(() => {
    if (!owner || !name) return;
    setLabelsLoading(true);
    apiClient<LabelsResponse>(
      `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/labels`,
    )
      .then((data) => setLabels(data.labels ?? []))
      .catch(() => setLabels([]))
      .finally(() => setLabelsLoading(false));
  }, [owner, name]);

  // ----- Fetch collaborators -----
  useEffect(() => {
    if (!owner || !name) return;
    setCollaboratorsLoading(true);
    apiClient<CollaboratorsResponse>(
      `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/collaborators`,
    )
      .then((data) => setCollaborators(data.collaborators ?? []))
      .catch(() => setCollaborators([]))
      .finally(() => setCollaboratorsLoading(false));
  }, [owner, name]);

  // ----- Toggle label -----
  const toggleLabel = useCallback((id: string) => {
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ----- Toggle assignee -----
  const toggleAssignee = useCallback((username: string) => {
    setSelectedAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  }, []);

  // ----- Markdown toolbar action -----
  const handleToolbarAction = useCallback(
    (prefix: string, suffix: string) => {
      const { start, end } = bodySelection;
      const { newText, newCursor } = insertMarkdown(body, start, end, prefix, suffix);
      setBody(newText);
      // Restore focus and move cursor after insertion
      setTimeout(() => {
        bodyInputRef.current?.focus();
        setBodySelection({ start: newCursor, end: newCursor });
      }, 50);
    },
    [body, bodySelection],
  );

  // ----- Validation -----
  const isValid =
    title.trim().length > 0 &&
    headBranch.length > 0 &&
    baseBranch.length > 0 &&
    headBranch !== baseBranch;

  // ----- Submit -----
  const handleSubmit = useCallback(async () => {
    if (!isValid || submitting || !owner || !name) return;

    setSubmitting(true);
    setSubmitError(null);

    const labelNames = labels
      .filter((l) => selectedLabelIds.has(l.id))
      .map((l) => l.name);

    const requestBody: CreatePrBody = {
      title: title.trim(),
      body: body.trim(),
      head: headBranch,
      base: baseBranch,
      draft: isDraft,
      labels: labelNames,
      assignees: Array.from(selectedAssignees),
    };

    try {
      const pr = await apiClient<PrCreatedResponse>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        },
      );

      // Navigate to PR detail screen
      router.replace(
        `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${pr.number}` as never,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create pull request';
      setSubmitError(message);
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  }, [
    isValid,
    submitting,
    owner,
    name,
    title,
    body,
    headBranch,
    baseBranch,
    isDraft,
    labels,
    selectedLabelIds,
    selectedAssignees,
    router,
  ]);

  // ----- Filtered collaborators for assignee search -----
  const filteredCollaborators = assigneeQuery.trim()
    ? collaborators.filter(
        (c) =>
          c.username.toLowerCase().includes(assigneeQuery.toLowerCase()) ||
          (c.displayName ?? '').toLowerCase().includes(assigneeQuery.toLowerCase()),
      )
    : collaborators;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.cancelBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.navTitle}>New Pull Request</Text>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!isValid || submitting}
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          accessibilityLabel="Create pull request"
        >
          {submitting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.submitText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ---- Branch selectors ---- */}
          <SectionHeader title="Compare Branches" />

          <View style={styles.branchSection}>
            {branchesLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={styles.branchLoader} />
            ) : (
              <View style={styles.branchRow}>
                {/* Head branch (from) */}
                <TouchableOpacity
                  style={styles.branchPicker}
                  onPress={() => setHeadPickerOpen(true)}
                  accessibilityLabel="Select head branch"
                >
                  <Text style={styles.branchPickerLabel}>From</Text>
                  <View style={styles.branchPickerInner}>
                    <Text style={styles.branchIcon}>⎇</Text>
                    <Text
                      style={[
                        styles.branchPickerValue,
                        !headBranch && styles.branchPickerPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {headBranch || 'Select branch'}
                    </Text>
                  </View>
                  <Text style={styles.branchChevron}>›</Text>
                </TouchableOpacity>

                {/* Comparison arrow */}
                <View style={styles.branchArrow}>
                  <Text style={styles.branchArrowText}>→</Text>
                </View>

                {/* Base branch (into) */}
                <TouchableOpacity
                  style={styles.branchPicker}
                  onPress={() => setBasePickerOpen(true)}
                  accessibilityLabel="Select base branch"
                >
                  <Text style={styles.branchPickerLabel}>Into</Text>
                  <View style={styles.branchPickerInner}>
                    <Text style={styles.branchIcon}>⎇</Text>
                    <Text
                      style={[
                        styles.branchPickerValue,
                        !baseBranch && styles.branchPickerPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {baseBranch || 'Select branch'}
                    </Text>
                  </View>
                  <Text style={styles.branchChevron}>›</Text>
                </TouchableOpacity>
              </View>
            )}

            {headBranch && baseBranch && headBranch === baseBranch && (
              <View style={styles.samebranchWarning}>
                <Text style={styles.samebranchWarningText}>
                  Head and base branch must be different.
                </Text>
              </View>
            )}
          </View>

          {/* ---- Title ---- */}
          <SectionHeader title="Title" />
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, 200))}
              placeholder="Add a descriptive title..."
              placeholderTextColor={Colors.textMuted}
              returnKeyType="next"
              maxLength={200}
              autoCorrect
              autoCapitalize="sentences"
            />
            <Text style={styles.charCount}>{title.length}/200</Text>
          </View>

          {/* ---- Description ---- */}
          <SectionHeader title="Description" />
          <MarkdownToolbar onAction={handleToolbarAction} />
          <View style={styles.inputWrapper}>
            <TextInput
              ref={bodyInputRef}
              style={styles.bodyInput}
              value={body}
              onChangeText={(t) => setBody(t.slice(0, 2000))}
              placeholder="Describe your changes (supports Markdown)..."
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              selection={bodySelection}
              onSelectionChange={(e) =>
                setBodySelection(e.nativeEvent.selection)
              }
              autoCorrect
              autoCapitalize="sentences"
            />
            <Text style={styles.charCount}>{body.length}/2000</Text>
          </View>

          {/* ---- Draft toggle ---- */}
          <SectionHeader title="Type" />
          <View style={styles.draftRow}>
            <View style={styles.draftLeft}>
              <Text style={styles.draftTitle}>Draft Pull Request</Text>
              <Text style={styles.draftSubtitle}>
                Mark as work in progress. Cannot be merged until marked ready.
              </Text>
            </View>
            <Switch
              value={isDraft}
              onValueChange={setIsDraft}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={isDraft ? Colors.primaryLight : Colors.textMuted}
              ios_backgroundColor={Colors.border}
            />
          </View>
          {isDraft && (
            <View style={styles.draftBadgeRow}>
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>Draft</Text>
              </View>
              <Text style={styles.draftBadgeNote}>
                This PR will be created as a draft.
              </Text>
            </View>
          )}

          {/* ---- Labels ---- */}
          <SectionHeader title="Labels" />
          <View style={styles.labelsContainer}>
            {labelsLoading ? (
              <ActivityIndicator
                size="small"
                color={Colors.primary}
                style={styles.sectionLoader}
              />
            ) : labels.length === 0 ? (
              <Text style={styles.emptyNote}>No labels configured for this repository.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {labels.map((label) => (
                  <LabelChip
                    key={label.id}
                    label={label}
                    selected={selectedLabelIds.has(label.id)}
                    onToggle={toggleLabel}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ---- Assignees ---- */}
          <SectionHeader title="Assignees" />
          <View style={styles.assigneesContainer}>
            {collaboratorsLoading ? (
              <ActivityIndicator
                size="small"
                color={Colors.primary}
                style={styles.sectionLoader}
              />
            ) : collaborators.length === 0 ? (
              <Text style={styles.emptyNote}>No collaborators found.</Text>
            ) : (
              <>
                <View style={styles.assigneeSearchRow}>
                  <TextInput
                    style={styles.assigneeSearch}
                    value={assigneeQuery}
                    onChangeText={setAssigneeQuery}
                    placeholder="Search collaborators..."
                    placeholderTextColor={Colors.textMuted}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.chipWrap}>
                  {filteredCollaborators.map((c) => (
                    <AssigneePill
                      key={c.id}
                      collaborator={c}
                      selected={selectedAssignees.has(c.username)}
                      onToggle={toggleAssignee}
                    />
                  ))}
                  {filteredCollaborators.length === 0 && (
                    <Text style={styles.emptyNote}>
                      No collaborators match "{assigneeQuery}"
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>

          {/* ---- Submit error ---- */}
          {submitError !== null && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          )}

          {/* ---- Bottom submit button ---- */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[
                styles.bottomSubmitBtn,
                isDraft && styles.bottomSubmitBtnDraft,
                (!isValid || submitting) && styles.bottomSubmitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isValid || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.bottomSubmitText}>
                  {isDraft ? 'Create Draft Pull Request' : 'Create Pull Request'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Branch picker modals */}
      <BranchPickerModal
        visible={headPickerOpen}
        title="Select Head Branch (From)"
        branches={branches}
        selected={headBranch}
        onSelect={setHeadBranch}
        onClose={() => setHeadPickerOpen(false)}
      />

      <BranchPickerModal
        visible={basePickerOpen}
        title="Select Base Branch (Into)"
        branches={branches}
        selected={baseBranch}
        onSelect={setBaseBranch}
        onClose={() => setBasePickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  // Nav bar
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cancelBtn: { minWidth: 60 },
  cancelText: { color: Colors.primaryLight, fontSize: 15 },
  navTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  submitBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  submitBtnDisabled: { backgroundColor: Colors.surfaceElevated },
  submitText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 60 },

  // Branch selector
  branchSection: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  branchLoader: { paddingVertical: 20 },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  branchPicker: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'column',
    gap: 4,
  },
  branchPickerLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  branchPickerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  branchIcon: { color: Colors.primaryLight, fontSize: 13 },
  branchPickerValue: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
    flex: 1,
  },
  branchPickerPlaceholder: { color: Colors.textMuted, fontWeight: '400' },
  branchChevron: { color: Colors.textMuted, fontSize: 18, lineHeight: 20 },
  branchArrow: {
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchArrowText: { color: Colors.primary, fontSize: 18, fontWeight: '700' },
  samebranchWarning: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#2B1A0D',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  samebranchWarningText: { color: Colors.warning, fontSize: 12 },

  // Text inputs
  inputWrapper: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  titleInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  bodyInput: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 140,
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'right',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },

  // Draft toggle
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  draftLeft: { flex: 1 },
  draftTitle: { color: Colors.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  draftSubtitle: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
  draftBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  draftBadge: {
    backgroundColor: '#2B2000',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.draftYellow,
  },
  draftBadgeText: { color: Colors.draftYellow, fontSize: 11, fontWeight: '700' },
  draftBadgeNote: { color: Colors.textMuted, fontSize: 12 },

  // Labels + assignees containers
  labelsContainer: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    minHeight: 56,
  },
  assigneesContainer: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    minHeight: 56,
  },
  sectionLoader: { paddingVertical: 14 },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
  },
  emptyNote: { color: Colors.textMuted, fontSize: 13, paddingVertical: 8, paddingHorizontal: 4 },

  // Assignee search
  assigneeSearchRow: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  assigneeSearch: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Error
  errorBox: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#2B0D0D',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: { color: Colors.error, fontSize: 13, lineHeight: 18 },

  // Bottom submit
  bottomActions: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  bottomSubmitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSubmitBtnDraft: { backgroundColor: '#7A5C0A' },
  bottomSubmitBtnDisabled: { backgroundColor: Colors.surfaceElevated },
  bottomSubmitText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
