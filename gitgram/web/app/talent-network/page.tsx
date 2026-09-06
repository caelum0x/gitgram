'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CoverageStrength,
  CreateTalentOpportunityInput,
  NeedCoverageAnalysis,
  TalentCandidateContact,
  TalentMatch,
  TalentOpportunity,
  TalentPilot,
  TalentPlacement,
  TalentReferral,
  talentGraphService,
} from '@/services/talentGraphService'
import { deriveUnlockState, findPlacement, formatFee, interpretUnlockResult } from '@/utils/talentUnlock'
import styles from './talent-network.module.css'

type Notice = {
  tone: 'status' | 'error'
  text: string
}

const GUIDE_STEPS = [
  {
    id: 'talent-opportunities',
    number: '01',
    title: 'Kurum ihtiyacı',
    detail: 'Kurum problemi, becerileri ve başarı ölçüsünü API kaydı olarak yayımlar.',
  },
  {
    id: 'evidence-matches',
    number: '02',
    title: 'Kanıt eşleşmesi',
    detail: 'GitGram, açık depo ve uygun pilot kanıtını aranan becerilerle karşılaştırır.',
  },
  {
    id: 'zen-referrals',
    number: '03',
    title: 'Zen kararı',
    detail: 'Zen yolunda kurum yönlendirir; aday tanıştırmayı kabul eder veya reddeder.',
  },
  {
    id: 'pilot-audit',
    number: '04',
    title: 'Pilot kaydı',
    detail: 'Kurum pilotu yürütür. GitGram teslimi ve durum değişikliklerini audit zincirine kaydeder.',
  },
  {
    id: 'public-proof',
    number: '05',
    title: 'Açık kanıt',
    detail: 'COMPLETED durum, katılımcı izni ve açık HTTP(S) teslimi birlikte gerekir.',
  },
] as const

const COVERAGE_STRENGTH_LABELS: Record<CoverageStrength, string> = {
  verified: 'Doğrulanmış',
  evidenced: 'Kanıtlı',
  interest: 'İlgi',
  unmet: 'Boşluk',
}

const COVERAGE_STATUS_LABELS: Record<NeedCoverageAnalysis['status'], string> = {
  'fully-covered': 'Tam kapsanıyor',
  'partially-covered': 'Kısmen kapsanıyor',
  unmet: 'Kapsanmıyor',
}

const EMPTY_FORM: CreateTalentOpportunityInput = {
  organizationName: '',
  title: '',
  problem: '',
  requiredSkills: [],
  successMetric: '',
  durationWeeks: 4,
  sourceChannel: 'direct',
  communityReferralConsent: false,
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response
    if (response?.data?.error?.message) return response.data.error.message
  }
  return error instanceof Error ? error.message : fallback
}

function mutationErrorStatus(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const status = (error as { response?: { status?: unknown } }).response?.status
    return typeof status === 'number' ? status : 503
  }
  return 503
}

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function hasPublicHttpDeliverable(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number)
    const privateIpv4 = ipv4 && (
      ipv4[0] === 0
      || ipv4[0] === 10
      || ipv4[0] === 127
      || (ipv4[0] === 169 && ipv4[1] === 254)
      || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
      || (ipv4[0] === 192 && (ipv4[1] === 0 || ipv4[1] === 168))
      || (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127)
      || ipv4[0] >= 224
    )
    const privateIpv6 = hostname.includes(':') && (
      hostname === '::'
      || hostname === '::1'
      || hostname.startsWith('::ffff:')
      || /^(fc|fd|fe[89ab]|ff)/.test(hostname)
      || hostname.startsWith('2001:db8:')
    )
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && Boolean(hostname)
      && !url.username
      && !url.password
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !hostname.endsWith('.local')
      && !hostname.endsWith('.internal')
      && !privateIpv4
      && !privateIpv6
  } catch {
    return false
  }
}

export default function TalentNetworkPage() {
  const [opportunities, setOpportunities] = useState<TalentOpportunity[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [matches, setMatches] = useState<TalentMatch[]>([])
  const [form, setForm] = useState<CreateTalentOpportunityInput>(EMPTY_FORM)
  const [skillsText, setSkillsText] = useState('')
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(true)
  const [opportunitiesError, setOpportunitiesError] = useState<string | null>(null)
  const [opportunitiesRequest, setOpportunitiesRequest] = useState(0)
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesError, setMatchesError] = useState<string | null>(null)
  const [matchesRequest, setMatchesRequest] = useState(0)
  const [coverage, setCoverage] = useState<NeedCoverageAnalysis | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [myPilots, setMyPilots] = useState<TalentPilot[]>([])
  const [pilotsLoading, setPilotsLoading] = useState(true)
  const [pilotsError, setPilotsError] = useState<string | null>(null)
  const [pilotsRequest, setPilotsRequest] = useState(0)
  const [pilotDrafts, setPilotDrafts] = useState<Record<string, { deliverableUrl: string; publicEvidenceConsent: boolean }>>({})
  const [savingPilotId, setSavingPilotId] = useState<string | null>(null)
  const [startingPilotId, setStartingPilotId] = useState<string | null>(null)
  const [myReferrals, setMyReferrals] = useState<TalentReferral[]>([])
  const [referralsLoading, setReferralsLoading] = useState(true)
  const [referralsError, setReferralsError] = useState<string | null>(null)
  const [referralsRequest, setReferralsRequest] = useState(0)
  const [referringId, setReferringId] = useState<string | null>(null)
  const [unlocks, setUnlocks] = useState<TalentPlacement[]>([])
  const [unlocksRequest, setUnlocksRequest] = useState(0)
  const [unlockedContacts, setUnlockedContacts] = useState<Record<string, TalentCandidateContact>>({})
  const [unlockBusyId, setUnlockBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const mutationKeys = useRef(new Map<string, { body: string; key: string }>())

  function mutationKey(action: string, payload: unknown) {
    const body = JSON.stringify(payload)
    const current = mutationKeys.current.get(action)
    if (current?.body === body) return current.key
    const key = crypto.randomUUID()
    mutationKeys.current.set(action, { body, key })
    return key
  }

  function settleMutation(action: string, error?: unknown) {
    if (!error || mutationErrorStatus(error) < 500) mutationKeys.current.delete(action)
  }

  const selected = useMemo(
    () => opportunities.find((opportunity) => opportunity.id === selectedId) || null,
    [opportunities, selectedId],
  )

  const publicProofPilots = useMemo(
    () => myPilots.filter((pilot) => (
      pilot.status === 'COMPLETED'
      && pilot.publicEvidenceConsent
      && hasPublicHttpDeliverable(pilot.deliverableUrl || '')
    )),
    [myPilots],
  )

  const currentGuideStep = useMemo(() => {
    if (publicProofPilots.length > 0) return 'public-proof'
    if (myPilots.length > 0) return 'pilot-audit'
    if (myReferrals.length > 0) return 'zen-referrals'
    if (matches.length > 0) return 'evidence-matches'
    return 'talent-opportunities'
  }, [matches.length, myPilots.length, myReferrals.length, publicProofPilots.length])

  useEffect(() => {
    let active = true
    setOpportunitiesLoading(true)
    setOpportunitiesError(null)
    talentGraphService.listOpportunities()
      .then((items) => {
        if (!active) return
        setOpportunities(items)
        setSelectedId((current) => (
          current && items.some((opportunity) => opportunity.id === current)
            ? current
            : items[0]?.id || null
        ))
      })
      .catch(() => {
        if (!active) return
        setOpportunities([])
        setSelectedId(null)
        setOpportunitiesError('Fırsat servisi yanıt vermedi. Oturumu kontrol edin veya yeniden deneyin.')
      })
      .finally(() => active && setOpportunitiesLoading(false))
    return () => { active = false }
  }, [opportunitiesRequest])

  useEffect(() => {
    let active = true
    setReferralsLoading(true)
    setReferralsError(null)
    setMyReferrals([])
    talentGraphService.listMyReferrals()
      .then((referrals) => active && setMyReferrals(referrals))
      .catch(() => active && setReferralsError('Yönlendirmeler okunamadı. Oturumu kontrol edin veya servisi yeniden çağırın.'))
      .finally(() => active && setReferralsLoading(false))
    return () => { active = false }
  }, [referralsRequest])

  useEffect(() => {
    let active = true
    setPilotsLoading(true)
    setPilotsError(null)
    setMyPilots([])
    setPilotDrafts({})
    talentGraphService.listMyPilots()
      .then((pilots) => {
        if (!active) return
        setMyPilots(pilots)
        setPilotDrafts(Object.fromEntries(pilots.map((pilot) => [pilot.id, {
          deliverableUrl: pilot.deliverableUrl || '',
          publicEvidenceConsent: pilot.publicEvidenceConsent,
        }])))
      })
      .catch(() => active && setPilotsError('Pilot kayıtları okunamadı. Oturumu kontrol edin veya servisi yeniden çağırın.'))
      .finally(() => active && setPilotsLoading(false))
    return () => { active = false }
  }, [pilotsRequest])

  useEffect(() => {
    if (!selectedId) {
      setMatches([])
      setMatchesError(null)
      setMatchesLoading(false)
      return
    }
    let active = true
    setMatches([])
    setMatchesError(null)
    setMatchesLoading(true)
    talentGraphService.getOpportunityMatches(selectedId)
      .then((result) => active && setMatches(result.matches))
      .catch(() => active && setMatchesError('Eşleşme servisi yanıt vermedi. Fırsatı yeniden seçin veya tekrar deneyin.'))
      .finally(() => active && setMatchesLoading(false))
    return () => { active = false }
  }, [matchesRequest, selectedId])

  useEffect(() => {
    if (!selectedId) {
      setCoverage(null)
      setCoverageError(null)
      setCoverageLoading(false)
      return
    }
    let active = true
    setCoverage(null)
    setCoverageError(null)
    setCoverageLoading(true)
    talentGraphService.getOpportunityCoverage(selectedId)
      .then((result) => active && setCoverage(result.coverage))
      .catch(() => active && setCoverageError('Beceri kapsama servisi yanıt vermedi.'))
      .finally(() => active && setCoverageLoading(false))
    return () => { active = false }
  }, [matchesRequest, selectedId])

  const isOpportunityOwner = selected?.viewerRole === 'institution'

  // Owner-only: load the recruiter's placement entitlements (receipts) so match
  // cards know which candidates are already unlocked or have a checkout pending.
  useEffect(() => {
    if (!selectedId || !isOpportunityOwner) {
      setUnlocks([])
      return
    }
    let active = true
    talentGraphService.listUnlocks(selectedId)
      .then((items) => active && setUnlocks(items))
      .catch(() => active && setUnlocks([]))
    return () => { active = false }
  }, [selectedId, isOpportunityOwner, unlocksRequest])

  // On-return from the Creem checkout the backend redirects to
  // /talent-network?opportunity=<id>&unlocked=<candidateId>. Select that
  // opportunity and reveal the candidate once the entitlement has settled.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const opportunityId = params.get('opportunity')
    const candidateId = params.get('unlocked')
    if (!opportunityId) return
    setSelectedId(opportunityId)
    if (!candidateId) return
    talentGraphService.getCandidateContact(opportunityId, candidateId)
      .then((contact) => {
        setUnlockedContacts((current) => ({ ...current, [candidateId]: contact }))
        setUnlocksRequest((request) => request + 1)
      })
      .catch(() => { /* still pending — the owner can retry from the match card */ })
  }, [])

  async function revealContact(opportunityId: string, candidateId: string) {
    const contact = await talentGraphService.getCandidateContact(opportunityId, candidateId)
    setUnlockedContacts((current) => ({ ...current, [candidateId]: contact }))
    setUnlocksRequest((request) => request + 1)
  }

  async function unlockCandidate(match: TalentMatch) {
    if (!selected || !isOpportunityOwner) return
    setUnlockBusyId(match.profile.id)
    setNotice(null)
    const action = `unlock:${selected.id}:${match.profile.id}`
    const payload = { candidateId: match.profile.id }
    try {
      const result = await talentGraphService.requestUnlock(selected.id, match.profile.id, mutationKey(action, payload))
      settleMutation(action)
      setUnlocks((current) => [result.placement, ...current.filter((placement) => placement.id !== result.placement.id)])
      const interpreted = interpretUnlockResult(result)
      if (interpreted.action === 'reveal') {
        await revealContact(selected.id, match.profile.id)
        setNotice({ tone: 'status', text: `${match.profile.displayName || match.profile.username} için kişi bilgisi ve tam kanıt açıldı.` })
      } else if (interpreted.checkoutUrl) {
        window.open(interpreted.checkoutUrl, '_blank', 'noopener,noreferrer')
        setNotice({ tone: 'status', text: 'Creem ödeme sekmesi açıldı. Ödeme tamamlanınca "Ödemeyi kontrol et" ile adayı açın.' })
      }
    } catch (error) {
      settleMutation(action, error)
      setNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Aday açılamadı. Fırsat sahibi oturumunu kontrol edip tekrar deneyin.'),
      })
    } finally {
      setUnlockBusyId(null)
    }
  }

  async function checkUnlockPayment(match: TalentMatch) {
    if (!selected) return
    setUnlockBusyId(match.profile.id)
    setNotice(null)
    try {
      await revealContact(selected.id, match.profile.id)
      setNotice({ tone: 'status', text: `${match.profile.displayName || match.profile.username} için kişi bilgisi ve tam kanıt açıldı.` })
    } catch (error) {
      setNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Ödeme henüz doğrulanmadı. Ödemeyi tamamladıysanız birkaç saniye sonra tekrar deneyin.'),
      })
    } finally {
      setUnlockBusyId(null)
    }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requiredSkills = skillsText.split(',').map((skill) => skill.trim().toLowerCase()).filter(Boolean)
    if (requiredSkills.length === 0) {
      setNotice({ tone: 'error', text: 'En az bir beceri yazın.' })
      return
    }

    setSubmitting(true)
    setNotice(null)
    const input = { ...form, requiredSkills }
    const action = 'opportunity:create'
    try {
      const created = await talentGraphService.createOpportunity(input, mutationKey(action, input))
      settleMutation(action)
      setOpportunities((current) => [created, ...current])
      setSelectedId(created.id)
      setOpportunitiesError(null)
      setForm(EMPTY_FORM)
      setSkillsText('')
      setNotice({ tone: 'status', text: 'Kurum ihtiyacı yayımlandı ve eşleşmeye açıldı.' })
    } catch (error) {
      settleMutation(action, error)
      setNotice({
        tone: 'error',
        text: getErrorMessage(error, 'İhtiyaç yayımlanamadı. Oturumu ve zorunlu alanları kontrol edip tekrar deneyin.'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function startPilot(match: TalentMatch) {
    if (!selected) return
    setStartingPilotId(match.profile.id)
    setNotice(null)
    const milestones = [
      'Başlangıç görüşmesi ve kapsam onayı',
      'İlk teslim ve kurum geri bildirimi',
      'Başarı metriği incelemesi',
    ]
    const action = `pilot:start:${selected.id}:${match.profile.id}`
    const payload = { participantId: match.profile.id, milestones }
    try {
      const created = await talentGraphService.startPilot(selected.id, match.profile.id, milestones, mutationKey(action, payload))
      settleMutation(action)
      setMyPilots((current) => [created, ...current.filter((pilot) => pilot.id !== created.id)])
      setPilotDrafts((current) => ({
        ...current,
        [created.id]: { deliverableUrl: created.deliverableUrl || '', publicEvidenceConsent: created.publicEvidenceConsent },
      }))
      setPilotsError(null)
      setPilotsLoading(false)
      setNotice({ tone: 'status', text: `${match.profile.displayName || match.profile.username} ile pilot başlatıldı.` })
      setOpportunitiesRequest((request) => request + 1)
      setMatchesRequest((request) => request + 1)
    } catch (error) {
      settleMutation(action, error)
      setNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Pilot başlatılamadı. Bu kurum ihtiyacının sahibi olarak giriş yapıp tekrar deneyin.'),
      })
    } finally {
      setStartingPilotId(null)
    }
  }

  async function savePilot(pilot: TalentPilot, complete = false) {
    const draft = pilotDrafts[pilot.id] || { deliverableUrl: '', publicEvidenceConsent: false }
    setSavingPilotId(pilot.id)
    setNotice(null)
    const input = {
      expectedRevision: pilot.revision,
      deliverableUrl: draft.deliverableUrl,
      ...(pilot.viewerRole === 'participant' ? { publicEvidenceConsent: draft.publicEvidenceConsent } : {}),
      ...(complete ? { status: 'COMPLETED' as const } : {}),
    }
    const action = `pilot:${complete ? 'complete' : 'save'}:${pilot.id}`
    try {
      const updated = await talentGraphService.updatePilot(pilot.id, input, mutationKey(action, input))
      settleMutation(action)
      setMyPilots((current) => current.map((item) => item.id === pilot.id ? updated : item))
      if (complete) {
        setOpportunitiesRequest((request) => request + 1)
      }
      setNotice({
        tone: 'status',
        text: complete
          ? 'Kurum pilotu tamamladı. Açık kanıt için katılımcı izni ve public HTTP(S) teslim bağlantısı da gerekir.'
          : 'Pilot teslimi ve görünürlük tercihi kaydedildi.',
      })
    } catch (error) {
      settleMutation(action, error)
      setNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Pilot güncellenemedi. Yetkinizi ve teslim bağlantısının public HTTP(S) adresi olduğunu kontrol edin.'),
      })
    } finally {
      setSavingPilotId(null)
    }
  }

  async function referMatch(match: TalentMatch) {
    if (!selected) return
    setReferringId(match.profile.id)
    setNotice(null)
    const action = `referral:create:${selected.id}:${match.profile.id}`
    const payload = { participantId: match.profile.id }
    try {
      const referral = await talentGraphService.createReferral(selected.id, match.profile.id, mutationKey(action, payload))
      settleMutation(action)
      setMyReferrals((current) => [referral, ...current.filter((item) => item.id !== referral.id)])
      setReferralsError(null)
      setReferralsLoading(false)
      setOpportunitiesRequest((request) => request + 1)
      setMatchesRequest((request) => request + 1)
      setNotice({ tone: 'status', text: `${match.profile.displayName || match.profile.username} için Zen Talent yönlendirmesi oluşturuldu.` })
    } catch (error) {
      settleMutation(action, error)
      setNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Yönlendirme yapılamadı. Fırsat sahibi oturumunu, Zen Talent kanalını ve topluluk iznini kontrol edin.'),
      })
    } finally {
      setReferringId(null)
    }
  }

  async function respondToReferral(referral: TalentReferral, status: 'ACCEPTED' | 'DECLINED') {
    setReferringId(referral.id)
    setNotice(null)
    const action = `referral:${status.toLowerCase()}:${referral.id}`
    const payload = { status, expectedRevision: referral.revision }
    try {
      const updated = await talentGraphService.updateReferral(referral.id, status, referral.revision, mutationKey(action, payload))
      settleMutation(action)
      setMyReferrals((current) => current.map((item) => item.id === referral.id ? updated : item))
      setNotice({
        tone: 'status',
        text: status === 'ACCEPTED' ? 'Topluluk tanıştırmasını kabul ettiniz.' : 'Topluluk tanıştırmasını reddettiniz.',
      })
    } catch (error) {
      settleMutation(action, error)
      setNotice({
        tone: 'error',
        text: getErrorMessage(error, 'Yönlendirme kararı kaydedilemedi. Katılımcı oturumunu kontrol edip tekrar deneyin.'),
      })
    } finally {
      setReferringId(null)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>GitGram Talent Graph</Link>
        <span>Kanıtlı beceri eşleştirmesi</span>
      </header>

      <section className={styles.hero}>
        <p>Zemin360 / 2026</p>
        <h1>İhtiyacı yaz.<br />Üretim kanıtıyla eşleş.</h1>
        <div className={styles.heroNote}>
          <span>API</span>
          <p>Bu ekran servis kayıtlarını okur. Sayılar API toplamıdır; GitGram istemci tarafında fırsat, aday veya pilot üretmez.</p>
        </div>
      </section>

      <nav className={styles.guide} aria-label="Talent Graph kayıt zinciri">
        <div className={styles.guideIntro}>
          <p>Kayıt zinciri</p>
          <h2>İhtiyaçtan açık kanıta</h2>
        </div>
        <ol>
          {GUIDE_STEPS.map((step) => (
            <li key={step.id} className={currentGuideStep === step.id ? styles.currentGuideStep : ''}>
              <a href={`#${step.id}`} aria-current={currentGuideStep === step.id ? 'step' : undefined}>
                <span>{step.number}</span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {notice && (
        <div
          className={`${styles.message} ${notice.tone === 'error' ? styles.messageError : ''}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <section className={styles.board} aria-label="Fırsatlar ve eşleşmeler">
        <aside id="talent-opportunities" className={styles.opportunities} aria-busy={opportunitiesLoading}>
          <div className={styles.columnTitle}>
            <span>01</span>
            <h2>Açık ihtiyaçlar</h2>
          </div>
          {opportunitiesLoading && <p className={styles.empty}>GitGram fırsat kayıtlarını okuyor.</p>}
          {!opportunitiesLoading && opportunitiesError && (
            <div className={styles.resourceError} role="alert">
              <p>{opportunitiesError}</p>
              <button type="button" onClick={() => setOpportunitiesRequest((request) => request + 1)}>Yeniden dene</button>
            </div>
          )}
          {!opportunitiesLoading && !opportunitiesError && opportunities.length === 0 && (
            <div className={styles.empty}>
              <p>API açık kurum ihtiyacı döndürmedi.</p>
              <a href="#create-opportunity">İlk ihtiyacı ekle</a>
            </div>
          )}
          {!opportunitiesLoading && !opportunitiesError && opportunities.map((opportunity) => (
            <button
              className={`${styles.opportunity} ${selectedId === opportunity.id ? styles.selected : ''}`}
              key={opportunity.id}
              onClick={() => {
                setMatches([])
                setMatchesError(null)
                setSelectedId(opportunity.id)
              }}
              type="button"
              aria-pressed={selectedId === opportunity.id}
            >
              <span>{opportunity.organizationName}</span>
              <strong>{opportunity.title}</strong>
              <small>{opportunity.durationWeeks} hafta · {opportunity.requiredSkills.join(', ')}</small>
              <small className={styles.opportunityCounts}>
                {opportunity.viewerRole === 'institution'
                  ? `${opportunity.referralSummary?.total || 0} yönlendirme · ${opportunity.pilotSummary?.active || 0} aktif pilot · ${opportunity.pilotSummary?.completed || 0} tamamlanan pilot`
                  : 'Operasyon sayıları yalnız fırsat sahibine görünür'}
              </small>
              {opportunity.sourceChannel !== 'direct' && <small className={styles.channel}>{opportunity.sourceChannel}</small>}
            </button>
          ))}
        </aside>

        <section id="evidence-matches" className={styles.matches} aria-live="polite" aria-busy={matchesLoading}>
          <div className={styles.columnTitle}>
            <span>02</span>
            <h2>Kanıtlı eşleşmeler</h2>
          </div>
          {!selected && !opportunitiesLoading && !opportunitiesError && <p className={styles.empty}>Eşleşme görmek için bir fırsat seçin.</p>}
          {!opportunitiesLoading && !opportunitiesError && selected && (
            <article className={styles.problem}>
              <span>{selected.organizationName}</span>
              <h3>{selected.title}</h3>
              <p>{selected.problem}</p>
              <dl>
                <div><dt>Başarı ölçüsü</dt><dd>{selected.successMetric}</dd></div>
                <div><dt>Durum</dt><dd>{selected.status}</dd></div>
                <div><dt>Kaynak</dt><dd>{selected.sourceChannel}</dd></div>
              </dl>
              {selected.viewerRole === 'institution' && (
                <div className={styles.outcomeCounts} aria-label="Fırsat kayıt sayıları">
                  <div><span>Yönlendirme</span><strong>{selected.referralSummary?.total || 0}</strong></div>
                  <div><span>Aktif pilot</span><strong>{selected.pilotSummary?.active || 0}</strong></div>
                  <div><span>Tamamlanan pilot</span><strong>{selected.pilotSummary?.completed || 0}</strong></div>
                </div>
              )}
              {selected.referralSummary && (
                <p className={styles.referralBreakdown}>
                  Bekleyen {selected.referralSummary.contacted} · Kabul {selected.referralSummary.accepted} · Ret {selected.referralSummary.declined}
                </p>
              )}
              {selected.viewerRole === 'institution' && (
                <p className={styles.apiCountNote}>Bu değerler seçili fırsat için API toplamıdır.</p>
              )}
            </article>
          )}
          {!opportunitiesLoading && !opportunitiesError && selected && (coverageLoading || coverageError || coverage) && (
            <article className={styles.coverage} aria-live="polite" aria-busy={coverageLoading}>
              <div className={styles.coverageHead}>
                <span>Beceri kapsama</span>
                {coverage && (
                  <strong data-status={coverage.status}>
                    {COVERAGE_STATUS_LABELS[coverage.status]} · %{Math.round(coverage.coverageRatio * 100)}
                  </strong>
                )}
              </div>
              {coverageLoading && <p className={styles.empty}>GitGram aday havuzunun beceri kapsamasını hesaplıyor.</p>}
              {!coverageLoading && coverageError && (
                <div className={styles.resourceError} role="alert">
                  <p>{coverageError}</p>
                  <button type="button" onClick={() => setMatchesRequest((request) => request + 1)}>Kapsamayı yeniden hesapla</button>
                </div>
              )}
              {!coverageLoading && !coverageError && coverage && (
                <>
                  <ul className={styles.coverageSkills}>
                    {coverage.coverage.map((entry) => (
                      <li key={entry.skill} data-strength={entry.strength}>
                        <span className={styles.coverageSkill}>{entry.skill}</span>
                        <span className={styles.coverageStrength}>{COVERAGE_STRENGTH_LABELS[entry.strength]}</span>
                        <span className={styles.coverageCount}>{entry.candidateCount} aday</span>
                      </li>
                    ))}
                  </ul>
                  {coverage.unmetSkills.length > 0 && (
                    <p className={styles.coverageGap}>Kapsanmayan beceriler: {coverage.unmetSkills.join(', ')}</p>
                  )}
                  <p className={styles.coverageNote}>{coverage.candidatePool} aday havuzu üzerinden hesaplandı.</p>
                </>
              )}
            </article>
          )}
          {!opportunitiesLoading && matchesLoading && <p className={styles.empty}>GitGram depo ve pilot kanıtlarını karşılaştırıyor.</p>}
          {!opportunitiesLoading && !matchesLoading && matchesError && selected && (
            <div className={styles.resourceError} role="alert">
              <p>{matchesError}</p>
              <button type="button" onClick={() => setMatchesRequest((request) => request + 1)}>Eşleşmeyi yeniden hesapla</button>
            </div>
          )}
          {!opportunitiesLoading && !matchesLoading && !matchesError && selected && matches.length === 0 && (
            <p className={styles.empty}>API, bu beceriler için herkese açık proje veya uygun pilot kanıtı olan profil döndürmedi.</p>
          )}
          {!opportunitiesLoading && !matchesLoading && !matchesError && matches.map((match, index) => {
            const referral = myReferrals.find((item) => item.opportunityId === selected?.id && item.participantId === match.profile.id)
            const existingPilot = myPilots.find((item) => item.opportunityId === selected?.id && item.participantId === match.profile.id)
            const isZenPath = selected?.sourceChannel === 'zen-talent'
            const actionRecordsLoading = isOpportunityOwner && (pilotsLoading || (isZenPath && referralsLoading))
            const actionRecordsUnavailable = isOpportunityOwner && Boolean(pilotsError || (isZenPath && referralsError))
            const placement = findPlacement(unlocks, match.profile.id)
            const unlockState = deriveUnlockState({ isOwner: isOpportunityOwner, placement })
            const revealedContact = unlockedContacts[match.profile.id]
            const unlockBusy = unlockBusyId === match.profile.id
            return (
            <article className={styles.match} key={match.profile.id}>
              <div className={styles.rank}>{String(index + 1).padStart(2, '0')}</div>
              <div>
                <p className={styles.matchName}>{match.profile.displayName || match.profile.username}</p>
                <p className={styles.reason}>{match.reason}</p>
                <div className={styles.skills}>{match.matchedSkills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                <div className={styles.evidence}>
                  {match.projects.map((project) => (
                    <a href={project.url} target="_blank" rel="noreferrer" key={project.id}>
                      {project.fullName} · {project.verificationLevel}
                    </a>
                  ))}
                </div>
              </div>
              <div className={styles.matchAction}>
                <strong>{match.score}</strong>
                <span>uyum puanı</span>
                {actionRecordsLoading && <em className={styles.referralState}>GitGram pilot ve yönlendirme kayıtlarını kontrol ediyor</em>}
                {!actionRecordsLoading && actionRecordsUnavailable && <em className={styles.referralState}>GitGram eylem için gereken hesap kayıtlarını okuyamadı</em>}
                {existingPilot && <em className={styles.referralState}>Pilot durumu: {existingPilot.status}</em>}
                {!actionRecordsLoading && !actionRecordsUnavailable && selected?.viewerRole === 'institution' && !existingPilot && !isZenPath && (
                  <button
                    type="button"
                    disabled={startingPilotId === match.profile.id}
                    onClick={() => startPilot(match)}
                  >
                    {startingPilotId === match.profile.id ? 'Pilot başlatılıyor' : 'Pilot başlat'}
                  </button>
                )}
                {!actionRecordsLoading && !actionRecordsUnavailable && selected?.viewerRole === 'institution' && !existingPilot && isZenPath && referral?.status === 'ACCEPTED' && (
                  <button
                    type="button"
                    disabled={startingPilotId === match.profile.id}
                    onClick={() => startPilot(match)}
                  >
                    {startingPilotId === match.profile.id ? 'Pilot başlatılıyor' : 'Kabul edilen adayla pilot başlat'}
                  </button>
                )}
                {!actionRecordsLoading && !actionRecordsUnavailable && selected?.viewerRole === 'institution' && !existingPilot && isZenPath && referral?.status === 'CONTACTED' && <em className={styles.referralState}>Aday kararı bekleniyor</em>}
                {!actionRecordsLoading && !actionRecordsUnavailable && selected?.viewerRole === 'institution' && !existingPilot && isZenPath && referral?.status === 'DECLINED' && <em className={styles.referralState}>Aday yönlendirmeyi reddetti</em>}
                {!actionRecordsLoading && !actionRecordsUnavailable && selected?.viewerRole === 'institution' && !existingPilot && isZenPath && !selected.communityReferralConsent && (
                  <em className={styles.referralState}>Kurum Zen yönlendirmesi için topluluk izni vermedi</em>
                )}
                {!actionRecordsLoading && !actionRecordsUnavailable && selected?.viewerRole === 'institution' && !existingPilot && isZenPath && selected.communityReferralConsent && !referral && (
                  <button type="button" disabled={referringId === match.profile.id} onClick={() => referMatch(match)}>
                    {referringId === match.profile.id ? 'Yönlendiriliyor' : 'Zen’e yönlendir'}
                  </button>
                )}
                {unlockState !== 'not-owner' && (
                  <div className={styles.unlock}>
                    {unlockState === 'unlockable' && (
                      <>
                        <span className={styles.unlockHint}>Kişi bilgisi ve tam kanıt için ödemeli erişim</span>
                        <button type="button" disabled={unlockBusy} onClick={() => unlockCandidate(match)}>
                          {unlockBusy ? 'Ödeme açılıyor' : 'Adayı aç'}
                        </button>
                      </>
                    )}
                    {unlockState === 'pending' && (
                      <>
                        <span className={styles.unlockHint}>
                          Ödeme bekleniyor{placement ? ` · ${formatFee(placement.feeCents, placement.currency)}` : ''}
                        </span>
                        <button type="button" disabled={unlockBusy} onClick={() => checkUnlockPayment(match)}>
                          {unlockBusy ? 'Kontrol ediliyor' : 'Ödemeyi kontrol et'}
                        </button>
                      </>
                    )}
                    {unlockState === 'unlocked' && !revealedContact && (
                      <button type="button" disabled={unlockBusy} onClick={() => checkUnlockPayment(match)}>
                        {unlockBusy ? 'Yükleniyor' : 'Kişi bilgisini göster'}
                      </button>
                    )}
                    {revealedContact && (
                      <div className={styles.contactCard}>
                        <h4>Aday iletişim bilgisi</h4>
                        <dl>
                          {revealedContact.contact.displayName && (
                            <><dt>Ad</dt><dd>{revealedContact.contact.displayName}</dd></>
                          )}
                          {revealedContact.contact.username && (
                            <><dt>Kullanıcı</dt><dd>@{revealedContact.contact.username}</dd></>
                          )}
                          {revealedContact.contact.email && (
                            <><dt>E-posta</dt><dd><a href={`mailto:${revealedContact.contact.email}`}>{revealedContact.contact.email}</a></dd></>
                          )}
                          {revealedContact.contact.githubUsername && (
                            <><dt>GitHub</dt><dd><a href={`https://github.com/${revealedContact.contact.githubUsername}`} target="_blank" rel="noreferrer">{revealedContact.contact.githubUsername}</a></dd></>
                          )}
                        </dl>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
            )
          })}
        </section>
      </section>

      <section id="zen-referrals" className={styles.referrals} aria-labelledby="my-referrals-title" aria-busy={referralsLoading}>
          <div>
            <span>03</span>
            <h2 id="my-referrals-title">Topluluk tanıştırmaları</h2>
            <p>Aday yönlendirmelerini burada görürsünüz. GitGram pilot ve açık kanıt sayılarını ayrı tutar.</p>
          </div>
          <div className={styles.referralList} aria-live="polite">
            {referralsLoading && <p className={styles.empty}>GitGram yönlendirme kayıtlarını okuyor.</p>}
            {!referralsLoading && referralsError && (
              <div className={styles.resourceError} role="alert">
                <p>{referralsError}</p>
                <div className={styles.resourceActions}>
                  <Link href="/login">Giriş yap</Link>
                  <button type="button" onClick={() => setReferralsRequest((request) => request + 1)}>Servisi yeniden dene</button>
                </div>
              </div>
            )}
            {!referralsLoading && !referralsError && myReferrals.length === 0 && (
              <p className={styles.empty}>Hesabınıza ait yönlendirme kaydı yok.</p>
            )}
            {!referralsLoading && !referralsError && myReferrals.map((referral) => (
              <article key={referral.id}>
                <div>
                  <span>{referral.opportunity.organizationName}</span>
                  <h3>{referral.opportunity.title}</h3>
                  <p>{referral.opportunity.problem}</p>
                </div>
                <strong>{referral.status}</strong>
                {referral.viewerRole === 'participant' && referral.status === 'CONTACTED' && (
                  <div className={styles.referralActions}>
                    <button type="button" disabled={referringId === referral.id} onClick={() => respondToReferral(referral, 'DECLINED')}>
                      {referringId === referral.id ? 'Kaydediliyor' : 'Reddet'}
                    </button>
                    <button type="button" disabled={referringId === referral.id} onClick={() => respondToReferral(referral, 'ACCEPTED')}>
                      {referringId === referral.id ? 'Kaydediliyor' : 'Tanıştırmayı kabul et'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
      </section>

      <section id="pilot-audit" className={styles.pilots} aria-labelledby="my-pilots-title" aria-busy={pilotsLoading}>
          <div className={styles.pilotIntro}>
            <span>04</span>
            <h2 id="my-pilots-title">Pilot kanıtları</h2>
            <p>Kurum pilotu tamamlar. Taraflar teslimi kaydeder; katılımcı açık Talent Graph görünürlüğünü seçer.</p>
          </div>
          <div className={styles.pilotList} aria-live="polite">
            {pilotsLoading && <p className={styles.empty}>GitGram pilot kayıtlarını okuyor.</p>}
            {!pilotsLoading && pilotsError && (
              <div className={styles.resourceError} role="alert">
                <p>{pilotsError}</p>
                <div className={styles.resourceActions}>
                  <Link href="/login">Giriş yap</Link>
                  <button type="button" onClick={() => setPilotsRequest((request) => request + 1)}>Servisi yeniden dene</button>
                </div>
              </div>
            )}
            {!pilotsLoading && !pilotsError && myPilots.length === 0 && (
              <p className={styles.empty}>Hesabınıza ait aktif veya tamamlanmış pilot kaydı yok.</p>
            )}
            {!pilotsLoading && !pilotsError && myPilots.map((pilot) => {
              const draft = pilotDrafts[pilot.id] || { deliverableUrl: '', publicEvidenceConsent: false }
              const draftEligible = pilot.status === 'COMPLETED' && draft.publicEvidenceConsent && hasPublicHttpDeliverable(draft.deliverableUrl)
              const proofEligibilitySaved = publicProofPilots.some((eligiblePilot) => eligiblePilot.id === pilot.id)
              const referral = pilot.referral || null
              const transitions = pilot.statusTransitions || []
              return (
                <article className={styles.pilot} key={pilot.id}>
                  <div className={styles.pilotHeading}>
                    <div>
                      <span>{pilot.opportunity.organizationName}</span>
                      <h3>{pilot.opportunity.title}</h3>
                    </div>
                    <strong>{pilot.status}</strong>
                  </div>
                  <ol className={styles.provenance} aria-label="Pilot kayıt zinciri">
                    <li>
                      <span>01 / Fırsat</span>
                      <strong>{pilot.opportunity.title}</strong>
                      <small>{pilot.opportunityId}</small>
                    </li>
                    <li>
                      <span>02 / Yönlendirme</span>
                      <strong>{referral ? referral.status : 'Doğrudan pilot'}</strong>
                      <small>{referral ? referral.id : 'Yönlendirme kaydı yok'}</small>
                    </li>
                    <li>
                      <span>03 / Katılımcı</span>
                      <strong>Katılımcı kaydı</strong>
                      <small>{pilot.participantId}</small>
                    </li>
                    <li>
                      <span>04 / Pilot</span>
                      <strong>{pilot.status}</strong>
                      <small>{pilot.id}</small>
                    </li>
                    <li>
                      <span>05 / Teslim</span>
                      <strong>{pilot.deliverableUrl ? 'Bağlantı kaydedildi' : 'Bağlantı bekleniyor'}</strong>
                      {pilot.deliverableUrl
                        ? <a href={pilot.deliverableUrl} target="_blank" rel="noreferrer">{pilot.deliverableUrl}</a>
                        : <small>Henüz herkese açık teslim yok</small>}
                    </li>
                  </ol>
                  <div className={styles.auditTrail}>
                    <h4>Durum geçmişi</h4>
                    {transitions.length > 0 ? (
                      <ol>
                        {transitions.map((transition) => (
                          <li key={transition.id}>
                            <strong>{transition.previousStatus} → {transition.nextStatus}</strong>
                            <span>{formatAuditTime(transition.createdAt)}</span>
                            <small>Revizyon {transition.revision} · Aktör {transition.actorId}</small>
                          </li>
                        ))}
                      </ol>
                    ) : <p>Bu pilot için henüz audit kaydı yok.</p>}
                  </div>
                  <label>
                    Açık teslim bağlantısı
                    <input
                      type="url"
                      placeholder="https://"
                      value={draft.deliverableUrl}
                      onChange={(event) => setPilotDrafts((current) => ({
                        ...current,
                        [pilot.id]: { ...draft, deliverableUrl: event.target.value },
                      }))}
                    />
                  </label>
                  {pilot.viewerRole === 'participant' && (
                    <label className={styles.pilotConsent}>
                      <input
                        type="checkbox"
                        checked={draft.publicEvidenceConsent}
                        onChange={(event) => setPilotDrafts((current) => ({
                          ...current,
                          [pilot.id]: { ...draft, publicEvidenceConsent: event.target.checked },
                        }))}
                      />
                      Tamamlanmış bu pilotu herkese açık profilimde doğrulanmış proje kanıtı olarak göster.
                    </label>
                  )}
                  <div className={styles.pilotActions}>
                    <span className={draftEligible ? styles.ready : ''}>
                      {proofEligibilitySaved
                        ? 'AÇIK KANIT KOŞULLARI KAYITLI'
                        : draftEligible
                          ? 'KOŞULLAR HAZIR · KAYDET'
                          : pilot.viewerRole === 'participant' ? 'KATILIMCI' : 'KURUM'}
                    </span>
                    <button type="button" disabled={savingPilotId === pilot.id} onClick={() => savePilot(pilot)}>
                      {savingPilotId === pilot.id ? 'Kaydediliyor' : 'Teslimatı kaydet'}
                    </button>
                    {pilot.viewerRole === 'institution' && pilot.status !== 'COMPLETED' && (
                      <button type="button" disabled={savingPilotId === pilot.id} onClick={() => savePilot(pilot, true)}>
                        {savingPilotId === pilot.id ? 'Kaydediliyor' : 'Pilotu tamamla'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
      </section>

      <section id="public-proof" className={styles.publicProof} aria-labelledby="public-proof-title">
        <div>
          <span>05</span>
          <h2 id="public-proof-title">Public Talent Graph kanıtı</h2>
        </div>
        <div className={styles.publicProofBody} aria-live="polite">
          <p>GitGram yalnız COMPLETED pilotu, katılımcı iznini ve public HTTP(S) teslim bağlantısını birlikte bulduğunda pilotu açık dosyaya ekler.</p>
          {pilotsLoading && <p className={styles.proofState} role="status">GitGram açık kanıt uygunluğu için pilot kayıtlarını okuyor.</p>}
          {!pilotsLoading && pilotsError && (
            <div className={styles.proofUnavailable} role="alert">
              <p>Pilot servisi yanıt vermediği için GitGram açık kanıt uygunluğunu ölçemiyor.</p>
              <Link href="/login">Oturumu kontrol et</Link>
            </div>
          )}
          {!pilotsLoading && !pilotsError && (
            <p className={styles.proofState}>
              {publicProofPilots.length > 0
                ? `${publicProofPilots.length} pilot API kaydında açık kanıt koşullarını karşılıyor.`
                : 'API kayıtlarında üç koşulu birlikte karşılayan pilot yok.'}
            </p>
          )}
          <Link href="/collaborate" className={styles.proofLink}>Talent Graph dosyanı aç</Link>
          <small>Bu bağlantı oturum sahibinin dosyasını açar. Kullanıcı adı bulunan dosya sahibi, ekrandaki paylaşım eylemiyle `/collaborate?profile=...` bağlantısını kopyalar.</small>
        </div>
      </section>

      <section id="create-opportunity" className={styles.create}>
        <div className={styles.createIntro}>
          <span>01 / Yeni kayıt</span>
          <h2>Kurum ihtiyacı ekle</h2>
          <p>Çözüm adı yerine problemi ve ölçülebilir sonucu yazın. Beceri alanı virgülle ayrılır.</p>
        </div>
        <form onSubmit={createOpportunity}>
          <label>Kurum adı<input required value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} /></label>
          <label>İhtiyaç başlığı<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className={styles.full}>Problem<textarea required rows={5} value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} /></label>
          <label>Beceriler<input required placeholder="typescript, data, ux" value={skillsText} onChange={(event) => setSkillsText(event.target.value)} /></label>
          <label>Süre (hafta)<input required type="number" min={1} max={16} value={form.durationWeeks} onChange={(event) => setForm({ ...form, durationWeeks: Number(event.target.value) })} /></label>
          <label>Topluluk kanalı
            <select value={form.sourceChannel} onChange={(event) => setForm({ ...form, sourceChannel: event.target.value as CreateTalentOpportunityInput['sourceChannel'] })}>
              <option value="direct">Doğrudan</option>
              <option value="gitgram">GitGram</option>
              <option value="zemin360">Zemin360</option>
              <option value="zen-talent">Zen Talent</option>
            </select>
          </label>
          <label className={styles.full}>Başarı ölçüsü<input required value={form.successMetric} onChange={(event) => setForm({ ...form, successMetric: event.target.value })} /></label>
          <label className={`${styles.full} ${styles.check}`}>
            <input type="checkbox" checked={form.communityReferralConsent} onChange={(event) => setForm({ ...form, communityReferralConsent: event.target.checked })} />
            Bu ihtiyacın seçilen topluluk kanalındaki uygun adaylara yönlendirilmesine izin veriyorum.
          </label>
          <button type="submit" disabled={submitting}>{submitting ? 'Yayımlanıyor' : 'İhtiyacı yayımla'}</button>
        </form>
      </section>
    </main>
  )
}
