import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CircleHelp, Expand, LoaderCircle, RotateCcw, Sparkles, Trophy, UsersRound, X } from 'lucide-react'

const QUESTIONS_PER_TEAM = 6
const POINTS_PER_BOX = 10
const SUBJECTS = ['IPAS', 'Matematika', 'Bahasa Indonesia', 'Pendidikan Pancasila', 'Bahasa Inggris', 'Seni Budaya']
const GENERATION_BATCH_SIZES = [10, 8, 5, 3]
const RETRY_BATCH_SIZES = [3, 5, 8, 10]
const MAX_GENERATION_RETRIES = 3

function normalizeStatement(statement) {
  return statement.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
}

function appendUniqueQuestions(existing, candidates, limit) {
  const statements = new Set(existing.map((question) => normalizeStatement(question.statement)))
  const result = [...existing]
  for (const question of candidates) {
    const statement = normalizeStatement(question.statement)
    if (!statement || statements.has(statement)) continue
    statements.add(statement)
    result.push(question)
    if (result.length === limit) break
  }
  return result
}

function shuffle(items) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function makeQuestionBoard(questions, count) {
  return shuffle(questions).slice(0, count).map((question) => ({
    ...question,
    used: false,
    answeredCorrectly: false,
    failedBy: [],
  }))
}

function getGenerationBatches(count) {
  const batches = []
  let remaining = count
  while (remaining > 0) {
    const batchSize = GENERATION_BATCH_SIZES.find((size) => size <= remaining)
      ?? GENERATION_BATCH_SIZES.find((size) => size > remaining)
    batches.push(batchSize)
    remaining -= Math.min(batchSize, remaining)
  }
  return batches
}

function splitStudents(students, teamCount) {
  const teams = Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Tim ${index + 1}`,
    students: [],
    score: 0,
  }))
  shuffle(students).forEach((student, index) => teams[index % teamCount].students.push(student))
  return teams
}

function TreasureHuntGame({ classroom, questionSets, onBack, onNavigate }) {
  const [teamCount, setTeamCount] = useState(2)
  const [selectedSetId, setSelectedSetId] = useState('all')
  const [teams, setTeams] = useState([])
  const [boxes, setBoxes] = useState([])
  const [activeTeamIndex, setActiveTeamIndex] = useState(0)
  const [openedBoxIndex, setOpenedBoxIndex] = useState(null)
  const [answerOutcome, setAnswerOutcome] = useState(null)
  const [turnPhase, setTurnPhase] = useState('select')
  const [turnTeamIndex, setTurnTeamIndex] = useState(0)
  const [turnRemaining, setTurnRemaining] = useState(0)
  const [turnDuration, setTurnDuration] = useState(30)
  const [gameStarted, setGameStarted] = useState(false)
  const [questionSource, setQuestionSource] = useState('bank')
  const [generatedQuestions, setGeneratedQuestions] = useState([])
  const [generationSubject, setGenerationSubject] = useState('IPAS')
  const [generationMaterial, setGenerationMaterial] = useState('')
  const [generationStatus, setGenerationStatus] = useState({ loading: false, error: '', message: '' })
  const boxCount = teamCount * QUESTIONS_PER_TEAM

  const availableSets = useMemo(
    () => questionSets.filter((set) => Number(set.grade) === Number(classroom.grade)),
    [questionSets, classroom.grade],
  )
  const selectedSet = availableSets.find((set) => set.id === selectedSetId)
  const bankQuestionPool = useMemo(() => {
    const sets = selectedSet ? [selectedSet] : availableSets
    const questions = sets.flatMap((set) => set.questions ?? [])
      .filter((question) => typeof question.statement === 'string' && question.statement.trim() && typeof question.answer === 'boolean')
    return [...new Map(questions.map((question) => [
      question.statement.trim().toLocaleLowerCase('id-ID'),
      question,
    ])).values()]
  }, [availableSets, selectedSet])
  const questionPool = questionSource === 'ai' ? generatedQuestions : bankQuestionPool
  const normalizedGeneratedStatements = generatedQuestions.map((question) => normalizeStatement(question.statement))
  const hasUniqueGeneratedStatements = new Set(normalizedGeneratedStatements).size === generatedQuestions.length
  const hasValidGeneratedQuestions = generatedQuestions.every((question) => (
    typeof question.statement === 'string'
    && question.statement.trim()
    && typeof question.answer === 'boolean'
    && typeof question.explanation === 'string'
    && question.explanation.trim()
  ))
  const canStartGame = questionSource === 'ai'
    ? generatedQuestions.length === boxCount && hasUniqueGeneratedStatements && hasValidGeneratedQuestions
    : questionPool.length >= boxCount
  const openedBox = openedBoxIndex === null ? null : boxes[openedBoxIndex]
  const resolvedCount = boxes.filter((box) => box.used || box.failedBy.length >= teams.length).length
  const isComplete = gameStarted && resolvedCount === boxes.length
  const highScore = teams.length ? Math.max(...teams.map((team) => team.score)) : 0
  const winners = teams.filter((team) => team.score === highScore)
  const hasEnoughStudents = classroom.students.length >= teamCount

  async function generateTreasureQuestions() {
    const material = generationMaterial.trim()
    if (material.length < 3 || material.length > 120) {
      setGenerationStatus({ loading: false, error: 'Materi harus berisi 3–120 karakter.', message: '' })
      return
    }

    const batches = getGenerationBatches(boxCount)
    let questions = []
    setGenerationStatus({ loading: true, error: '', message: `Menyiapkan ${boxCount} soal...` })
    try {
      for (const [index, requested] of batches.entries()) {
        setGenerationStatus({
          loading: true,
          error: '',
          message: `Membuat kumpulan soal ${index + 1} dari ${batches.length}...`,
        })
        const response = await fetch('/api/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade: Number(classroom.grade),
            subject: generationSubject,
            material,
            count: requested,
            excludeStatements: questions.map((question) => question.statement),
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Soal belum berhasil dibuat. Silakan coba lagi.')
        if (!Array.isArray(result.questions) || result.questions.length > requested
          || result.questions.some((question) => (
            typeof question?.statement !== 'string'
            || typeof question?.answer !== 'boolean'
            || typeof question?.explanation !== 'string'
          ))) {
          throw new Error('Format soal dari layanan AI belum sesuai. Silakan coba buat ulang.')
        }
        questions = appendUniqueQuestions(questions, result.questions, boxCount)
        setGeneratedQuestions(questions)
        setQuestionSource('ai')
        if (questions.length >= boxCount) break
      }

      for (let retry = 0; questions.length < boxCount && retry < MAX_GENERATION_RETRIES; retry += 1) {
        const needed = boxCount - questions.length
        const requested = RETRY_BATCH_SIZES.find((size) => size >= needed) ?? RETRY_BATCH_SIZES[RETRY_BATCH_SIZES.length - 1]
        setGenerationStatus({
          loading: true,
          error: '',
          message: `Mencari soal unik tambahan (${questions.length} dari ${boxCount})...`,
        })
        const response = await fetch('/api/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade: Number(classroom.grade),
            subject: generationSubject,
            material,
            count: requested,
            excludeStatements: questions.map((question) => question.statement),
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Soal tambahan belum berhasil dibuat. Silakan coba lagi.')
        if (!Array.isArray(result.questions) || result.questions.length > requested
          || result.questions.some((question) => (
            typeof question?.statement !== 'string'
            || typeof question?.answer !== 'boolean'
            || typeof question?.explanation !== 'string'
          ))) {
          throw new Error('Format soal tambahan dari layanan AI belum sesuai.')
        }
        questions = appendUniqueQuestions(questions, result.questions, boxCount)
        setGeneratedQuestions(questions)
      }
      setGenerationStatus({
        loading: false,
        error: '',
        message: questions.length === boxCount
          ? `${boxCount} soal unik siap. Periksa dan edit sebelum memulai permainan.`
          : `AI menghasilkan ${questions.length} soal unik dari ${boxCount}. Tambahkan atau edit soal di bawah untuk melengkapi jumlahnya.`,
      })
    } catch (error) {
      if (questions.length > 0) setQuestionSource('ai')
      setGenerationStatus({
        loading: false,
        error: error.message || 'Terjadi kesalahan saat menghubungi layanan AI.',
        message: '',
      })
    }
  }

  function startGame() {
    if (!hasEnoughStudents || !canStartGame) return
    const requestFullscreen = document.documentElement.requestFullscreen
    if (requestFullscreen) requestFullscreen.call(document.documentElement).catch(() => {})
    setTeams(splitStudents(classroom.students, teamCount))
    const questions = questionSource === 'ai'
      ? generatedQuestions.map((question) => ({
        ...question,
        statement: question.statement.trim(),
        explanation: question.explanation.trim(),
      }))
      : questionPool
    setBoxes(makeQuestionBoard(questions, boxCount))
    setActiveTeamIndex(0)
    setOpenedBoxIndex(null)
    setAnswerOutcome(null)
    setTurnPhase('select')
    setTurnTeamIndex(0)
    setTurnRemaining(0)
    setGameStarted(true)
  }

  function selectBox(index) {
    if (boxes[index]?.used || boxes[index]?.failedBy.includes(activeTeamIndex) || boxes[index]?.failedBy.length >= teams.length || isComplete) return
    setOpenedBoxIndex(index)
    setAnswerOutcome(null)
    setTurnTeamIndex(0)
    setTurnRemaining(turnDuration)
    setTurnPhase('reading')
  }

  function answerQuestion(answer) {
    if (openedBoxIndex === null || turnPhase !== 'answering' || answerOutcome) return
    const isCorrect = answer === openedBox.answer
    const answeringTeam = teams[turnTeamIndex]
    setBoxes((current) => current.map((box, index) => index === openedBoxIndex
      ? {
        ...box,
        used: isCorrect,
        answeredCorrectly: isCorrect,
        failedBy: isCorrect ? box.failedBy : [...box.failedBy, turnTeamIndex],
      }
      : box))
    if (isCorrect) {
      setTeams((current) => current.map((team, index) => index === turnTeamIndex
        ? { ...team, score: team.score + POINTS_PER_BOX }
        : team))
    }
    setAnswerOutcome({ isCorrect, answer, teamName: answeringTeam.name })
  }

  function continueAnswering() {
    if (!answerOutcome) return
    const resolvedAfterAnswer = answerOutcome.isCorrect
      || (openedBox && openedBox.failedBy.length >= teams.length)
    if (resolvedAfterAnswer || turnTeamIndex + 1 >= teams.length) {
      finishTurn()
      return
    }
    setTurnTeamIndex((current) => current + 1)
    setAnswerOutcome(null)
  }

  const finishTurn = useCallback(() => {
    setOpenedBoxIndex(null)
    setAnswerOutcome(null)
    setTurnPhase('select')
    setTurnTeamIndex(0)
    setTurnRemaining(0)
    setActiveTeamIndex((current) => (current + 1) % teams.length)
  }, [teams.length])

  useEffect(() => {
    if (turnPhase !== 'reading' || openedBoxIndex === null) return undefined
    const timeoutId = window.setInterval(() => {
      setTurnRemaining((current) => {
        if (current > 1) return current - 1
        setTurnTeamIndex((currentTeam) => {
          if (currentTeam + 1 < teams.length) {
            setTurnRemaining(turnDuration)
            return currentTeam + 1
          }
          setTurnPhase('answering')
          setTurnRemaining(0)
          return 0
        })
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timeoutId)
  }, [openedBoxIndex, teams.length, turnDuration, turnPhase])

  function returnToSetup() {
    setGameStarted(false)
    setTeams([])
    setBoxes([])
    setOpenedBoxIndex(null)
    setAnswerOutcome(null)
    setTurnPhase('select')
    setTurnTeamIndex(0)
    setTurnRemaining(0)
  }

  useEffect(() => {
    if (!gameStarted) {
      document.body.classList.remove('treasure-fullscreen-mode')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      return undefined
    }

    document.body.classList.add('treasure-fullscreen-mode')
    return () => document.body.classList.remove('treasure-fullscreen-mode')
  }, [gameStarted])

  if (!gameStarted) {
    return (
      <div className="page-section treasure-page">
        <section className="page-title-row">
          <div>
            <button className="game-back-link" type="button" onClick={onBack}><ArrowLeft size={14} /> Semua permainan</button>
            <span className="eyebrow">STUDIO AKTIVITAS KELAS {classroom.name}</span>
            <h1>Berburu harta karun <span className="title-sparkle">✳</span></h1>
            <p>Bentuk tim, jawab enam soal per tim, dan kumpulkan poin bersama.</p>
          </div>
          <span className="game-ready-badge"><span /> {boxCount} KOTAK SOAL</span>
        </section>

        <section className="treasure-setup-card">
          <div className="treasure-setup-copy">
            <span className="treasure-setup-icon"><Sparkles size={23} /></span>
            <div><span className="eyebrow">SEBELUM BERMAIN</span><h2>Siapkan perburuan</h2><p>Siswa kelas {classroom.name} akan diacak dan dibagi merata. Tim yang mendapat giliran bebas memilih kotak; jawaban benar memberi 10 poin dan mengunci kotak, sedangkan jawaban salah membuat kotak tetap tersedia untuk tim lain.</p></div>
          </div>
          <div className="treasure-setup-fields">
            <label className="setup-label">Jumlah tim
              <span className="setup-hint">Pilih 2–6 tim; perlu minimal satu siswa untuk setiap tim.</span>
              <select className="treasure-select" value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))} disabled={generationStatus.loading}>
                {Array.from({ length: 5 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} tim</option>)}
              </select>
            </label>
            <label className="setup-label">Sumber soal
              <span className="setup-hint">{questionSource === 'ai' ? `${generatedQuestions.length} dari ${boxCount} soal AI tersedia.` : 'Pilih paket yang sesuai tingkat kelas.'}</span>
              <select className="treasure-select" value={questionSource} onChange={(event) => setQuestionSource(event.target.value)} disabled={generationStatus.loading}>
                <option value="bank">Bank soal</option>
                <option value="ai">Soal AI {generatedQuestions.length ? `(${generatedQuestions.length})` : '(tambahkan soal)'}</option>
              </select>
            </label>
            <label className="setup-label">Waktu setiap giliran
              <span className="setup-hint">Waktu membaca per tim sebelum berganti giliran.</span>
              <select className="treasure-select" value={turnDuration} onChange={(event) => setTurnDuration(Number(event.target.value))} disabled={generationStatus.loading}>
                <option value="15">15 detik</option>
                <option value="30">30 detik</option>
                <option value="45">45 detik</option>
                <option value="60">60 detik</option>
              </select>
            </label>
            {questionSource === 'bank' && <label className="setup-label">Paket soal
              <span className="setup-hint">Papan perlu {boxCount} soal berbeda; bank punya {bankQuestionPool.length}.</span>
              <select className="treasure-select" value={selectedSetId} onChange={(event) => setSelectedSetId(event.target.value)} disabled={generationStatus.loading}>
                <option value="all">Gabungkan semua paket ({bankQuestionPool.length} soal)</option>
                {availableSets.map((set) => <option key={set.id} value={set.id}>{set.title} ({set.questions.filter((question) => typeof question.answer === 'boolean').length} soal)</option>)}
              </select>
            </label>}
          </div>
          {!hasEnoughStudents && <div className="form-error treasure-error"><CircleHelp size={16} />Tambahkan setidaknya {teamCount} siswa agar setiap tim mendapat anggota.</div>}
          {questionPool.length < boxCount && <div className="form-error treasure-error"><CircleHelp size={16} />{questionSource === 'bank' ? `Sumber bank memiliki ${questionPool.length} soal benar/salah berbeda sementara papan memerlukan ${boxCount}. Buat soal AI di bawah atau pilih paket lain.` : `Tersedia ${questionPool.length} dari ${boxCount} soal. Tambah atau edit soal AI di bawah sebelum memulai.`}</div>}
          {availableSets.length === 0 && <div className="no-question-kits treasure-error"><CircleHelp size={16} /><span>Belum ada paket soal untuk tingkat kelas {classroom.grade}. Kamu tetap bisa membuat soal AI untuk permainan ini.</span><button type="button" onClick={() => onNavigate('questions')}>Buka bank soal <ArrowLeft size={13} /></button></div>}
          <section className="treasure-ai-generator" aria-label="Buat soal berburu harta karun dengan AI">
            <div><span className="eyebrow">BUAT SOAL DENGAN DEEPSEEK</span><p>AI membuat soal untuk papan ini. Duplikat akan dilewati dan AI akan mencoba mencari soal unik tambahan; soal AI tidak mengubah bank soal.</p></div>
            <div className="treasure-ai-fields">
              <label className="setup-label">Mata pelajaran
                <select className="treasure-select" value={generationSubject} onChange={(event) => setGenerationSubject(event.target.value)} disabled={generationStatus.loading}>
                  {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
              </label>
              <label className="setup-label">Materi
                <input className="treasure-material-input" type="text" minLength={3} maxLength={120} placeholder="Contoh: sistem pencernaan manusia" value={generationMaterial} onChange={(event) => setGenerationMaterial(event.target.value)} disabled={generationStatus.loading} />
              </label>
              <button className="button button-outline treasure-generate-button" type="button" onClick={generateTreasureQuestions} disabled={generationStatus.loading || generationMaterial.trim().length < 3}>
                {generationStatus.loading ? <><LoaderCircle className="spin" size={15} /> Membuat soal...</> : <><Sparkles size={15} /> Buat {boxCount} soal</>}
              </button>
            </div>
            {generationStatus.message && <p className="treasure-generation-message" role="status">{generationStatus.message}</p>}
            {generationStatus.error && <div className="form-error treasure-error" role="alert"><CircleHelp size={16} />{generationStatus.error}</div>}
            {questionSource === 'ai' && (
              <section className="treasure-question-editor" aria-label="Edit soal AI untuk permainan">
                <div className="treasure-editor-heading">
                  <div><strong>Periksa dan edit soal</strong><span>{generatedQuestions.length} dari {boxCount} soal · pernyataan harus unik</span></div>
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => setGeneratedQuestions((current) => [...current, {
                      id: `teacher-${Date.now()}`,
                      statement: '',
                      answer: true,
                      explanation: '',
                    }])}
                    disabled={generationStatus.loading || generatedQuestions.length >= boxCount}
                  >
                    Tambah soal
                  </button>
                </div>
                <div className="treasure-question-editor-list">
                  {generatedQuestions.map((question, index) => (
                    <article className="treasure-question-editor-card" key={index}>
                      <div className="treasure-question-editor-top">
                        <strong>Soal {index + 1}</strong>
                        <button
                          className="treasure-remove-question"
                          type="button"
                          onClick={() => setGeneratedQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}
                          aria-label={`Hapus soal ${index + 1}`}
                          disabled={generationStatus.loading}
                        >
                          <X size={15} /> Hapus
                        </button>
                      </div>
                      <label className="setup-label">Pernyataan
                        <textarea
                          className="treasure-question-edit-input"
                          value={question.statement}
                          onChange={(event) => setGeneratedQuestions((current) => current.map((item, questionIndex) => questionIndex === index ? { ...item, statement: event.target.value } : item))}
                          maxLength={500}
                          rows={2}
                          disabled={generationStatus.loading}
                        />
                      </label>
                      <div className="treasure-question-editor-fields">
                        <label className="setup-label">Jawaban
                          <select
                            className="treasure-select"
                            value={String(question.answer)}
                            onChange={(event) => setGeneratedQuestions((current) => current.map((item, questionIndex) => questionIndex === index ? { ...item, answer: event.target.value === 'true' } : item))}
                            disabled={generationStatus.loading}
                          >
                            <option value="true">Benar</option>
                            <option value="false">Salah</option>
                          </select>
                        </label>
                        <label className="setup-label">Penjelasan
                          <textarea
                            className="treasure-question-edit-input"
                            value={question.explanation}
                            onChange={(event) => setGeneratedQuestions((current) => current.map((item, questionIndex) => questionIndex === index ? { ...item, explanation: event.target.value } : item))}
                            maxLength={500}
                            rows={2}
                            disabled={generationStatus.loading}
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
                {(!hasUniqueGeneratedStatements || !hasValidGeneratedQuestions) && (
                  <p className="treasure-editor-validation" role="alert">Isi pernyataan dan penjelasan, lalu pastikan semua pernyataan berbeda.</p>
                )}
              </section>
            )}
          </section>
          <div className="treasure-setup-footer">
            <span><UsersRound size={16} /> {classroom.students.length} siswa · {boxCount} kotak · enam giliran per tim</span>
            <button className="button button-primary" type="button" onClick={startGame} disabled={generationStatus.loading || !hasEnoughStudents || !canStartGame}>Acak tim & mulai <Sparkles size={16} /></button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page-section treasure-page">
      <section className="treasure-game-heading">
        <div>
          <button className="game-back-link" type="button" onClick={returnToSetup}><ArrowLeft size={14} /> Pengaturan permainan</button>
          <span className="eyebrow">BERBURU HARTA KARUN · KELAS {classroom.name}</span>
          <h1>{isComplete ? 'Perburuan selesai!' : 'Pilih kotak soal'} <span className="title-sparkle">✳</span></h1>
          <p>{isComplete ? 'Semua kotak sudah terjawab atau tidak dapat dipilih lagi.' : turnPhase === 'select' ? 'Giliran tim memilih satu kotak secara bebas. Jika salah, tim lain masih boleh mencobanya.' : turnPhase === 'reading' ? `Tim membaca soal secara bergiliran, ${turnDuration} detik per tim.` : 'Semua tim menjawab soal secara bergiliran.'}</p>
        </div>
        <div className="treasure-heading-actions">
          <div className="treasure-progress"><strong>{resolvedCount}<small> / {boxCount}</small></strong><span>KOTAK SELESAI</span></div>
          <button className="button button-outline treasure-fullscreen-button" type="button" onClick={() => { const requestFullscreen = document.documentElement.requestFullscreen; if (requestFullscreen) requestFullscreen.call(document.documentElement).catch(() => {}) }}><Expand size={15} /> Layar penuh</button>
        </div>
      </section>

      {isComplete && (
        <section className="treasure-winner" aria-live="polite">
          <Trophy size={27} />
          <div><span className="eyebrow">{highScore > 0 ? 'PEMENANG' : 'PERBURUAN SELESAI'}</span><strong>{highScore > 0 ? (winners.length > 1 ? `Seri: ${winners.map((team) => team.name).join(' & ')}` : winners[0]?.name) : 'Belum ada tim yang mengumpulkan poin'}</strong><small>{highScore} poin tertinggi · semua {boxCount} kotak sudah selesai</small></div>
          <button className="button button-outline" type="button" onClick={returnToSetup}><RotateCcw size={15} /> Main lagi</button>
        </section>
      )}

      <div className="treasure-layout">
        <section className="treasure-board-panel">
          <div className="treasure-panel-heading"><div><span className="eyebrow">PETA HARTA KARUN</span><strong>{boxCount} kotak misteri</strong></div><span>Pilih kotak untuk menjawab soal</span></div>
          <div className="treasure-box-grid">
            {boxes.map((box, index) => {
              const failedByActiveTeam = box.failedBy.includes(activeTeamIndex)
              const exhausted = box.failedBy.length >= teams.length
              const disabled = box.used || failedByActiveTeam || exhausted || isComplete
              return (
                <button key={index} type="button" className={`treasure-box ${box.used ? 'is-locked' : ''} ${box.answeredCorrectly ? 'is-used-correct' : ''} ${!box.used && box.failedBy.length ? 'is-used-wrong' : ''} ${openedBoxIndex === index ? 'is-selected' : ''}`} disabled={disabled || turnPhase !== 'select'} onClick={() => selectBox(index)} aria-label={box.used ? `Kotak ${index + 1}, sudah benar` : failedByActiveTeam ? `Kotak ${index + 1}, sudah dijawab salah oleh tim ini` : `Pilih kotak ${index + 1}`}>
                  {box.used ? <><Check size={17} /><small>BENAR</small></> : <><span>{String(index + 1).padStart(2, '0')}</span><Sparkles size={17} />{box.failedBy.length > 0 && <small>{exhausted ? 'HABIS' : 'COBA LAGI'}</small>}</>}
                </button>
              )
            })}
          </div>
          <div className="treasure-board-legend"><span><i /> Belum dipilih</span><span><i className="legend-locked" /> Benar terkunci · salah dapat dipilih tim lain</span></div>
        </section>

        <aside className="treasure-score-panel">
          <div className="treasure-panel-heading"><div><span className="eyebrow">PAPAN SKOR</span><strong>Tim bermain</strong></div><Trophy size={18} /></div>
          <div className="treasure-team-list">
            {teams.map((team, index) => (
              <article key={team.id} className={`treasure-team-card ${index === activeTeamIndex && !isComplete ? 'is-current' : ''}`}>
                <div className="treasure-team-top"><strong>{team.name}</strong><b>{team.score}<small> poin</small></b></div>
                <div className="treasure-team-students">{team.students.map((student) => <span key={student.id}>{student.name}</span>)}</div>
                {index === activeTeamIndex && !isComplete && <span className="treasure-turn-tag">GILIRAN TIM INI</span>}
              </article>
            ))}
          </div>
          <button type="button" className="button button-outline treasure-reset" onClick={returnToSetup}><RotateCcw size={14} /> Atur ulang perburuan</button>
        </aside>
      </div>

      {openedBox && (
        <div className="modal-backdrop treasure-modal-backdrop" role="presentation" onClick={() => { if (answerOutcome) finishTurn() }}>
          <section className="treasure-question-modal" role="dialog" aria-modal="true" aria-labelledby="treasure-question-title" onClick={(event) => event.stopPropagation()}>
            <div className="treasure-modal-top"><div><span className="eyebrow">KOTAK {String(openedBoxIndex + 1).padStart(2, '0')} · {teams[turnTeamIndex]?.name}</span><h2 id="treasure-question-title">{turnPhase === 'reading' ? 'Waktu membaca soal' : 'Waktu menjawab soal'}</h2></div><button className="icon-button" type="button" aria-label="Tutup soal" onClick={() => answerOutcome && continueAnswering()} disabled={!answerOutcome}><X size={18} /></button></div>
            <p className="treasure-question-text">{openedBox.statement}</p>
            {turnPhase === 'reading' ? (
              <div className={`treasure-turn-timer ${turnRemaining <= 5 ? 'is-urgent' : ''}`} role="timer">
                <strong>{turnRemaining}</strong>
                <span>DETIK UNTUK MEMBACA · Setelah waktu habis, giliran tim berikutnya</span>
              </div>
            ) : answerOutcome ? (
              <div className={`treasure-answer-feedback ${answerOutcome.isCorrect ? 'answer-was-correct' : 'answer-was-wrong'}`} role="status">
                {answerOutcome.isCorrect ? <Check size={20} /> : <X size={20} />}
                <div><strong>{answerOutcome.isCorrect ? `Benar! ${answerOutcome.teamName} mendapat ${POINTS_PER_BOX} poin dan kotak terkunci.` : `Belum tepat. Kotak tetap terbuka untuk tim lain; giliran menjawab ${teams[turnTeamIndex + 1]?.name ?? 'selesai'} berikutnya.`}</strong><span>Jawaban: {openedBox.answer ? 'Benar' : 'Salah'}{openedBox.explanation ? ` · ${openedBox.explanation}` : ''}</span></div>
              </div>
            ) : (
              <div className="treasure-answer-options">
                <button type="button" className="treasure-answer-true" onClick={() => answerQuestion(true)}><Check size={19} /> BENAR</button>
                <button type="button" className="treasure-answer-false" onClick={() => answerQuestion(false)}><X size={19} /> SALAH</button>
              </div>
            )}
            {answerOutcome && <button className="button button-primary treasure-next-turn" type="button" onClick={continueAnswering}>{answerOutcome.isCorrect || turnTeamIndex + 1 >= teams.length || openedBox.failedBy.length >= teams.length ? (isComplete ? 'Lihat hasil akhir' : 'Kembali memilih kotak') : `Giliran menjawab ${teams[turnTeamIndex + 1]?.name}`} <ArrowLeft size={15} /></button>}
          </section>
        </div>
      )}
    </div>
  )
}

export default TreasureHuntGame
