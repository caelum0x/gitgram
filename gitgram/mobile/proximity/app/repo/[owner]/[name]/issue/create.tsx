import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const C = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  elevated: '#232340',
  inputBg: '#1E1E38',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  success: '#34D399',
  error: '#F87171',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Label {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

interface Assignee {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Milestone {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  dueOn: string | null;
}

interface IssueTemplate {
  name: string;
  title: string | null;
  body: string;
  labels: string[];
}

interface CreatedIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
}

interface LabelsResponse {
  labels: Label[];
}

interface AssigneesResponse {
  assignees: Assignee[];
}

interface MilestonesResponse {
  milestones: Milestone[];
}

interface TemplatesResponse {
  templates: IssueTemplate[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Simple markdown renderer (Text-based)
// ---------------------------------------------------------------------------
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    if (line.startsWith('### ')) {
      return (
        <Text key={idx} style={md.h3}>{line.slice(4)}{'\n'}</Text>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <Text key={idx} style={md.h2}>{line.slice(3)}{'\n'}</Text>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <Text key={idx} style={md.h1}>{line.slice(2)}{'\n'}</Text>
      );
    }
    if (line.startsWith('> ')) {
      return (
        <View key={idx} style={md.blockquoteContainer}>
          <Text style={md.blockquote}>{line.slice(2)}</Text>
        </View>
      );
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <Text key={idx} style={md.listItem}>{'  •  '}{line.slice(2)}{'\n'}</Text>
      );
    }
    if (line.startsWith('```') || line === '```') {
      return <Text key={idx} style={md.codeBlock}>{line}{'\n'}</Text>;
    }
    // Inline bold/italic/code (simple pass)
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    const inline = parts.map((part, pIdx) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return <Text key={pIdx} style={md.inlineCode}>{part.slice(1, -1)}</Text>;
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <Text key={pIdx} style={md.bold}>{part.slice(2, -2)}</Text>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <Text key={pIdx} style={md.italic}>{part.slice(1, -1)}</Text>;
      }
      return <Text key={pIdx}>{part}</Text>;
    });
    return (
      <Text key={idx} style={md.paragraph}>{inline}{'\n'}</Text>
    );
  });
}

const md = StyleSheet.create({
  h1: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  h2: { color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  h3: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  paragraph: { color: C.textSec, fontSize: 14, lineHeight: 21 },
  listItem: { color: C.textSec, fontSize: 14, lineHeight: 21 },
  blockquoteContainer: {
    borderLeftWidth: 3,
    borderLeftColor: C.primaryLight,
    paddingLeft: 10,
    marginVertical: 2,
  },
  blockquote: { color: C.textMuted, fontSize: 14, fontStyle: 'italic' },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: C.elevated,
    color: C.primaryLight,
    fontSize: 13,
  },
  bold: { color: C.text, fontWeight: '700' },
  italic: { color: C.textSec, fontStyle: 'italic' },
  codeBlock: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: C.primaryLight,
    fontSize: 12,
    backgroundColor: C.elevated,
  },
});

// ---------------------------------------------------------------------------
// LabelChip
// ---------------------------------------------------------------------------
interface LabelChipProps {
  label: Label;
  selected: boolean;
  onToggle: (id: string) => void;
}

function LabelChip({ label, selected, onToggle }: LabelChipProps) {
  const bg = selected ? hexToRgba(label.color.startsWith('#') ? label.color : `#${label.color}`, 0.25) : C.elevated;
  const borderColor = label.color.startsWith('#') ? label.color : `#${label.color}`;
  return (
    <Pressable
      style={[chipStyles.chip, { backgroundColor: bg, borderColor: selected ? borderColor : C.border }]}
      onPress={() => onToggle(label.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`Label: ${label.name}`}
    >
      <View style={[chipStyles.dot, { backgroundColor: borderColor }]} />
      <Text style={[chipStyles.name, selected && { color: C.text }]}>{label.name}</Text>
      {selected && <Text style={chipStyles.check}>{'✓'}</Text>}
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
    marginRight: 6,
    marginBottom: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { color: C.textSec, fontSize: 12, fontWeight: '600' },
  check: { color: C.success, fontSize: 11, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// AssigneeRow
// ---------------------------------------------------------------------------
interface AssigneeRowProps {
  user: Assignee;
  selected: boolean;
  onToggle: (id: string) => void;
}

function AssigneeRow({ user, selected, onToggle }: AssigneeRowProps) {
  const initial = (user.username[0] ?? '?').toUpperCase();
  return (
    <Pressable
      style={[assigneeStyles.row, selected && assigneeStyles.rowSelected]}
      onPress={() => onToggle(user.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`Assignee: ${user.username}`}
    >
      <View style={assigneeStyles.avatar}>
        <Text style={assigneeStyles.initial}>{initial}</Text>
      </View>
      <View style={assigneeStyles.info}>
        <Text style={assigneeStyles.displayName}>{user.displayName ?? user.username}</Text>
        <Text style={assigneeStyles.username}>@{user.username}</Text>
      </View>
      {selected && <Text style={assigneeStyles.check}>{'✓'}</Text>}
    </Pressable>
  );
}

const assigneeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  rowSelected: { backgroundColor: hexToRgba('#7C3AED', 0.1) },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: { color: C.white, fontWeight: '700', fontSize: 14 },
  info: { flex: 1 },
  displayName: { color: C.text, fontSize: 14, fontWeight: '600' },
  username: { color: C.textMuted, fontSize: 12 },
  check: { color: C.success, fontSize: 16, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sectionStyles.header}>
      <Text style={sectionStyles.title}>{title}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function CreateIssueScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Labels
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const [labelsLoading, setLabelsLoading] = useState(false);

  // Assignees
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<Set<string>>(new Set());
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');

  // Milestones
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [milestoneSheetVisible, setMilestoneSheetVisible] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<IssueTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSheetVisible, setTemplateSheetVisible] = useState(false);

  const titleInputRef = useRef<TextInput>(null);

  const enc = (s: string) => encodeURIComponent(s);
  const base = `/v1/repositories/${enc(owner ?? '')}/${enc(name ?? '')}`;

  // ----- Fetch metadata -----
  useEffect(() => {
    if (!owner || !name) return;

    const loadLabels = async () => {
      setLabelsLoading(true);
      try {
        const data = await apiClient<LabelsResponse>(`${base}/labels`);
        setLabels(data.labels ?? []);
      } catch {
        setLabels([]);
      } finally {
        setLabelsLoading(false);
      }
    };

    const loadAssignees = async () => {
      setAssigneesLoading(true);
      try {
        const data = await apiClient<AssigneesResponse>(`${base}/assignees`);
        setAssignees(data.assignees ?? []);
      } catch {
        setAssignees([]);
      } finally {
        setAssigneesLoading(false);
      }
    };

    const loadMilestones = async () => {
      setMilestonesLoading(true);
      try {
        const data = await apiClient<MilestonesResponse>(`${base}/milestones`);
        setMilestones(data.milestones ?? []);
      } catch {
        setMilestones([]);
      } finally {
        setMilestonesLoading(false);
      }
    };

    const loadTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const data = await apiClient<TemplatesResponse>(`${base}/issue-templates`);
        setTemplates(data.templates ?? []);
      } catch {
        setTemplates([]);
      } finally {
        setTemplatesLoading(false);
      }
    };

    loadLabels();
    loadAssignees();
    loadMilestones();
    loadTemplates();
  }, [owner, name, base]);

  // ----- Handlers -----
  const toggleLabel = useCallback((id: string) => {
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAssignee = useCallback((id: string) => {
    setSelectedAssigneeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyTemplate = useCallback((template: IssueTemplate) => {
    if (template.title) setTitle(template.title);
    setBody(template.body);
    setTemplateSheetVisible(false);
  }, []);

  const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId) ?? null;

  const filteredAssignees = assigneeSearch.trim()
    ? assignees.filter(
        (a) =>
          a.username.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
          (a.displayName ?? '').toLowerCase().includes(assigneeSearch.toLowerCase()),
      )
    : assignees;

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        body: body.trim() || null,
        labelIds: Array.from(selectedLabelIds),
        assigneeIds: Array.from(selectedAssigneeIds),
        milestoneId: selectedMilestoneId,
      };
      const created = await apiClient<CreatedIssue>(`${base}/issues`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      router.replace(
        `/repo/${enc(owner ?? '')}/${enc(name ?? '')}/issue/${created.number}` as never,
      );
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create issue');
    } finally {
      setSubmitting(false);
    }
  }, [title, body, selectedLabelIds, selectedAssigneeIds, selectedMilestoneId, submitting, base, owner, name, router]);

  const canSubmit = title.trim().length > 0 && !submitting;

  const selectedAssigneesLabel = selectedAssigneeIds.size === 0
    ? 'No assignees'
    : `${selectedAssigneeIds.size} assignee${selectedAssigneeIds.size > 1 ? 's' : ''}`;

  // ----- Render -----
  return (
    <SafeAreaView style={s.safeArea}>
      {/* Nav bar */}
      <View style={s.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.navBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={s.navTitle}>New Issue</Text>

        <TouchableOpacity
          onPress={handleSubmit}
          style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Submit issue"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <Text style={[s.submitText, !canSubmit && s.submitTextDisabled]}>Submit</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {submitError !== null && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{submitError}</Text>
          <Pressable onPress={() => setSubmitError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.errorDismiss}>{'✕'}</Text>
          </Pressable>
        </View>
      )}

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <View style={s.fieldSection}>
            <Text style={s.fieldLabel}>Title <Text style={s.required}>*</Text></Text>
            <TextInput
              ref={titleInputRef}
              style={s.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Short, descriptive title"
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
              maxLength={256}
              autoFocus
              accessibilityLabel="Issue title"
            />
          </View>

          {/* Body with preview toggle */}
          <View style={s.fieldSection}>
            <View style={s.bodyHeader}>
              <Text style={s.fieldLabel}>Description</Text>
              <View style={s.previewToggle}>
                <Pressable
                  style={[s.toggleTab, !previewMode && s.toggleTabActive]}
                  onPress={() => setPreviewMode(false)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: !previewMode }}
                >
                  <Text style={[s.toggleTabText, !previewMode && s.toggleTabTextActive]}>Write</Text>
                </Pressable>
                <Pressable
                  style={[s.toggleTab, previewMode && s.toggleTabActive]}
                  onPress={() => setPreviewMode(true)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: previewMode }}
                >
                  <Text style={[s.toggleTabText, previewMode && s.toggleTabTextActive]}>Preview</Text>
                </Pressable>
              </View>
            </View>

            {previewMode ? (
              <View style={s.previewBox}>
                {body.trim() ? (
                  renderMarkdown(body)
                ) : (
                  <Text style={s.previewEmpty}>Nothing to preview</Text>
                )}
              </View>
            ) : (
              <TextInput
                style={s.bodyInput}
                value={body}
                onChangeText={setBody}
                placeholder="Describe the issue..."
                placeholderTextColor={C.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={65536}
                accessibilityLabel="Issue body"
              />
            )}
          </View>

          {/* Template selector */}
          {templates.length > 0 && (
            <View style={s.selectorSection}>
              <Pressable
                style={s.selectorRow}
                onPress={() => setTemplateSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose issue template"
              >
                <Text style={s.selectorIcon}>{'📋'}</Text>
                <View style={s.selectorInfo}>
                  <Text style={s.selectorLabel}>Issue template</Text>
                  <Text style={s.selectorValue}>Choose a template</Text>
                </View>
                <Text style={s.selectorChevron}>{'›'}</Text>
              </Pressable>
            </View>
          )}

          {/* Labels */}
          <SectionHeader title="Labels" />
          <View style={s.labelsSection}>
            {labelsLoading ? (
              <ActivityIndicator size="small" color={C.primary} style={s.loader} />
            ) : labels.length === 0 ? (
              <Text style={s.emptyNote}>No labels available</Text>
            ) : (
              <View style={s.chipWrap}>
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

          {/* Assignees */}
          <SectionHeader title="Assignees" />
          <View style={s.assigneesSection}>
            <View style={s.searchRow}>
              <Text style={s.searchIcon}>{'🔍'}</Text>
              <TextInput
                style={s.searchInput}
                value={assigneeSearch}
                onChangeText={setAssigneeSearch}
                placeholder="Search collaborators..."
                placeholderTextColor={C.textMuted}
                returnKeyType="search"
                accessibilityLabel="Search assignees"
              />
              {assigneeSearch.length > 0 && (
                <Pressable onPress={() => setAssigneeSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.searchClear}>{'✕'}</Text>
                </Pressable>
              )}
            </View>

            {assigneesLoading ? (
              <ActivityIndicator size="small" color={C.primary} style={s.loader} />
            ) : filteredAssignees.length === 0 ? (
              <Text style={s.emptyNote}>
                {assigneeSearch ? 'No results' : 'No collaborators found'}
              </Text>
            ) : (
              filteredAssignees.map((user) => (
                <AssigneeRow
                  key={user.id}
                  user={user}
                  selected={selectedAssigneeIds.has(user.id)}
                  onToggle={toggleAssignee}
                />
              ))
            )}

            {selectedAssigneeIds.size > 0 && (
              <View style={s.selectedBadge}>
                <Text style={s.selectedBadgeText}>{selectedAssigneesLabel}</Text>
              </View>
            )}
          </View>

          {/* Milestone */}
          <SectionHeader title="Milestone" />
          <View style={s.milestoneSection}>
            {milestonesLoading ? (
              <ActivityIndicator size="small" color={C.primary} style={s.loader} />
            ) : milestones.length === 0 ? (
              <Text style={s.emptyNote}>No open milestones</Text>
            ) : (
              <Pressable
                style={s.selectorRow}
                onPress={() => setMilestoneSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={`Milestone: ${selectedMilestone?.title ?? 'None'}`}
              >
                <Text style={s.selectorIcon}>{'🎯'}</Text>
                <View style={s.selectorInfo}>
                  <Text style={s.selectorLabel}>Milestone</Text>
                  <Text style={s.selectorValue}>
                    {selectedMilestone ? selectedMilestone.title : 'No milestone'}
                  </Text>
                </View>
                <Text style={s.selectorChevron}>{'›'}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Template bottom sheet */}
      <Modal
        visible={templateSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTemplateSheetVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setTemplateSheetVisible(false)}>
          <View style={s.bottomSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Choose a template</Text>
            <FlatList<IssueTemplate>
              data={templates}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <Pressable
                  style={s.templateRow}
                  onPress={() => applyTemplate(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Template: ${item.name}`}
                >
                  <View style={s.flex}>
                    <Text style={s.templateName}>{item.name}</Text>
                    {item.title !== null && (
                      <Text style={s.templateTitle} numberOfLines={1}>{item.title}</Text>
                    )}
                  </View>
                  <Text style={s.templateChevron}>{'›'}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={s.emptyNote}>No templates available</Text>
              }
            />
            <Pressable
              style={s.sheetCancelBtn}
              onPress={() => setTemplateSheetVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel template selection"
            >
              <Text style={s.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Milestone bottom sheet */}
      <Modal
        visible={milestoneSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMilestoneSheetVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setMilestoneSheetVisible(false)}>
          <View style={s.bottomSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Select milestone</Text>
            <Pressable
              style={[s.milestoneRow, selectedMilestoneId === null && s.milestoneRowSelected]}
              onPress={() => { setSelectedMilestoneId(null); setMilestoneSheetVisible(false); }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedMilestoneId === null }}
            >
              <Text style={s.milestoneName}>No milestone</Text>
              {selectedMilestoneId === null && <Text style={s.milestoneCheck}>{'✓'}</Text>}
            </Pressable>
            <FlatList<Milestone>
              data={milestones}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[s.milestoneRow, selectedMilestoneId === item.id && s.milestoneRowSelected]}
                  onPress={() => { setSelectedMilestoneId(item.id); setMilestoneSheetVisible(false); }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedMilestoneId === item.id }}
                  accessibilityLabel={`Milestone: ${item.title}`}
                >
                  <View style={s.flex}>
                    <Text style={s.milestoneName}>{item.title}</Text>
                    {item.dueOn !== null && (
                      <Text style={s.milestoneDue}>
                        Due {new Date(item.dueOn).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  {selectedMilestoneId === item.id && <Text style={s.milestoneCheck}>{'✓'}</Text>}
                </Pressable>
              )}
            />
            <Pressable
              style={s.sheetCancelBtn}
              onPress={() => setMilestoneSheetVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel milestone selection"
            >
              <Text style={s.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Nav bar
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  navBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 64,
  },
  cancelText: { color: C.primaryLight, fontSize: 16 },
  navTitle: {
    flex: 1,
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 64,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: C.elevated },
  submitText: { color: C.white, fontSize: 14, fontWeight: '700' },
  submitTextDisabled: { color: C.textMuted },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B1F1F',
    borderBottomWidth: 1,
    borderBottomColor: '#5C2D2D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  errorText: { flex: 1, color: C.error, fontSize: 13, lineHeight: 18 },
  errorDismiss: { color: C.textMuted, fontSize: 16 },

  // Fields
  fieldSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  fieldLabel: { color: C.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  required: { color: C.error },
  titleInput: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 16,
  },

  // Body
  bodyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewToggle: {
    flexDirection: 'row',
    backgroundColor: C.elevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  toggleTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  toggleTabActive: { backgroundColor: C.primary },
  toggleTabText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  toggleTabTextActive: { color: C.white },
  bodyInput: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 140,
  },
  previewBox: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    minHeight: 140,
  },
  previewEmpty: { color: C.textMuted, fontSize: 14, fontStyle: 'italic' },

  // Selector row
  selectorSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  selectorIcon: { fontSize: 18 },
  selectorInfo: { flex: 1 },
  selectorLabel: { color: C.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  selectorValue: { color: C.text, fontSize: 14, marginTop: 1 },
  selectorChevron: { color: C.textMuted, fontSize: 22, lineHeight: 24 },

  // Labels section
  labelsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },

  // Assignees
  assigneesSection: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 4,
  },
  searchClear: { color: C.textMuted, fontSize: 14 },
  selectedBadge: {
    margin: 12,
    alignSelf: 'flex-start',
    backgroundColor: hexToRgba('#7C3AED', 0.2),
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedBadgeText: { color: C.primaryLight, fontSize: 12, fontWeight: '600' },

  // Milestone section
  milestoneSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },

  // Shared
  loader: { paddingVertical: 14 },
  emptyNote: { color: C.textMuted, fontSize: 13, paddingHorizontal: 16, paddingVertical: 14 },

  // Bottom sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: C.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 36,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },

  // Template rows
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  templateName: { color: C.text, fontSize: 15, fontWeight: '600' },
  templateTitle: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  templateChevron: { color: C.textMuted, fontSize: 22, lineHeight: 24 },

  // Milestone rows
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  milestoneRowSelected: { backgroundColor: hexToRgba('#7C3AED', 0.12) },
  milestoneName: { color: C.text, fontSize: 15, fontWeight: '600' },
  milestoneDue: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  milestoneCheck: { color: C.success, fontSize: 17, fontWeight: '700' },

  sheetCancelBtn: {
    marginHorizontal: 20,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  sheetCancelText: { color: C.textSec, fontSize: 15, fontWeight: '600' },
});
