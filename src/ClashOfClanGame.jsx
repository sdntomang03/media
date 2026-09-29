import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CircleHelp, Clock3, Crown, Expand, LoaderCircle, Shield, Sparkles, Trophy, UsersRound, X } from 'lucide-react'

const QUESTIONS_PER_TEAM = 6
const SUBJECTS = ['IPAS', 'Matematika', 'Bahasa Indonesia', 'Pendidikan Pancasila', 'Bahasa Inggris', 'Seni Budaya']
const TEAM_COLORS = ['#e8a940', '#548cc5', '#54a77a', '#db6c63', '#9670be', '#4aa6a3']
const QUESTION_BATCH_SIZES = [10, 8, 5, 3]

function shuffle(items) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const latexSymbols = {
  alpha: 'α',
  beta: 'β',
  cdot: '·',
  div: '÷',
  ge: '≥',
  infty: '∞',
  le: '≤',
  mu: 'μ',
  neq: '≠',
  theta: 'θ',
  pi: 'π',
  pm: '±',
  times: '×',
}

function readLatexArgument(expression, start) {
  if (expression[start] !== '{') return { value: expression[start] ?? '', next: start + 1 }
  let depth = 1
  let index = start + 1
  while (index < expression.length && depth > 0) {
    if (expression[index] === '{') depth += 1
    if (expression[index] === '}') depth -= 1
    index += 1
  }
  return { value: expression.slice(start + 1, depth === 0 ? index - 1 : index), next: index }
}

function renderLatex(expression, keyPrefix = 'latex') {
  const nodes = []
  let text = ''
  let index = 0
  const flushText = () => {
    if (!text) return
    nodes.push(text)
    text = ''
  }

  while (index < expression.length) {
    const character = expression[index]
    if (character === '\\') {
      const command = expression.slice(index + 1).match(/^[a-zA-Z]+/)
      if (!command) {
        text += expression[index + 1] ?? '\\'
        index += expression[index + 1] ? 2 : 1
        continue
      }
      const name = command[0]
      index += name.length + 1
      if (['left', 'right'].includes(name)) continue
      if (['text', 'mathrm', 'mathbf'].includes(name)) {
        const argument = readLatexArgument(expression, index)
        if (argument.next > index) {
          flushText()
          nodes.push(<span className={`clash-math-${name}`} key={`${keyPrefix}-${index}`}>{renderLatex(argument.value, `${keyPrefix}-${name}-${index}`)}</span>)
          index = argument.next
          continue
        }
      }
      if (name === 'frac') {
        const numerator = readLatexArgument(expression, index)
        const denominator = readLatexArgument(expression, numerator.next)
        if (numerator.next > index && denominator.next > numerator.next) {
          flushText()
          nodes.push(<span className="clash-math-fraction" key={`${keyPrefix}-${index}`}><span>{renderLatex(numerator.value, `${keyPrefix}-n-${index}`)}</span><span>{renderLatex(denominator.value, `${keyPrefix}-d-${index}`)}</span></span>)
          index = denominator.next
          continue
        }
      }
      if (name === 'sqrt') {
        const radicand = readLatexArgument(expression, index)
        if (radicand.next > index) {
          flushText()
          nodes.push(<span className="clash-math-root" key={`${keyPrefix}-${index}`}>√<span>{renderLatex(radicand.value, `${keyPrefix}-r-${index}`)}</span></span>)
          index = radicand.next
          continue
        }
      }
      text += latexSymbols[name] ?? name
      continue
    }
    if (character === '^' || character === '_') {
      const argument = readLatexArgument(expression, index + 1)
      if (argument.next > index + 1) {
        flushText()
        const Tag = character === '^' ? 'sup' : 'sub'
        nodes.push(<Tag key={`${keyPrefix}-${index}`}>{renderLatex(argument.value, `${keyPrefix}-power-${index}`)}</Tag>)
        index = argument.next
        continue
      }
    }
    if (character === '{' || character === '}') {
      index += 1
      continue
    }
    text += character
    index += 1
  }
  flushText()
  return nodes
}

function RichText({ text }) {
  const parts = String(text ?? '').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g)
  return (
    <span className="clash-rich-text">
      {parts.map((part, index) => {
        const display = part.startsWith('$$') || part.startsWith('\\[')
        const inline = part.startsWith('$') || part.startsWith('\\(')
        if (!inline && !display) return <span key={`text-${index}`}>{part}</span>
        const expression = part.startsWith('$$') ? part.slice(2, -2)
          : part.startsWith('\\[') ? part.slice(2, -2)
            : part.startsWith('$') ? part.slice(1, -1) : part.slice(2, -2)
        return <span className={`clash-math ${display ? 'is-display' : ''}`} key={`math-${index}`} role="math" aria-label={expression}>{renderLatex(expression, `math-${index}`)}</span>
      })}
    </span>
  )
}

function answerMatches(question, value) {
  const submitted = normalizeAnswer(value)
  if (!submitted) return false
  if (typeof question.answer === 'boolean') {
    const accepted = question.answer
      ? ['benar', 'betul', 'true', 'iya', 'ya', '1']
      : ['salah', 'keliru', 'false', 'tidak', 'bukan', '0']
    return accepted.includes(submitted)
  }
  return String(question.answer).split(/[;|]/).some((answer) => normalizeAnswer(answer) === submitted)
}

function makeEditableQuestion(question) {
  const answerType = typeof question.answer === 'boolean' ? 'boolean' : 'text'
  const booleanAnswer = answerType === 'boolean' ? question.answer : true
  const textAnswer = answerType === 'text'
    ? String(question.answer)
    : ''
  return { ...question, answerType, booleanAnswer, textAnswer }
}

function getNextBatchSize(remaining) {
  if (remaining > QUESTION_BATCH_SIZES[0]) return QUESTION_BATCH_SIZES[0]
  return QUESTION_BATCH_SIZES.find((size) => size >= remaining) ?? QUESTION_BATCH_SIZES[QUESTION_BATCH_SIZES.length - 1]
}

function splitStudents(students, teamCount) {
  const teams = Array.from({ length: teamCount }, (_, index) => ({
    id: `clash-team-${index + 1}`,
    name: `Tim ${index + 1}`,
    students: [],
    score: 0,
    color: TEAM_COLORS[index],
  }))
  shuffle(students).forEach((student, index) => teams[index % teamCount].students.push(student))
  return teams
}

function makeQuestionBoard(questions, count) {
  return shuffle(questions).slice(0, count).map((question) => ({ ...question }))
}

function ClashOfClanGame({ classroom, questionSets, onBack }) {
  const [teamCount, setTeamCount] = useState(2)
  const [questionSource, setQuestionSource] = useState('bank')
  const [generatedQuestions, setGeneratedQuestions] = useState([])
  const [generationSubject, setGenerationSubject] = useState('IPAS')
  const [generationMaterial, setGenerationMaterial] = useState('')
  const [generationAnswerFormat, setGenerationAnswerFormat] = useState('boolean')
  const [generationStatus, setGenerationStatus] = useState({ loading: false, error: '', message: '' })
  const [teams, setTeams] = useState([])
  const [questions, setQuestions] = useState([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [turnIndex, setTurnIndex] = useState(0)
  const [roundStarterIndex, setRoundStarterIndex] = useState(0)
  const [phase, setPhase] = useState('setup')
  const [readingDuration, setReadingDuration] = useState(30)
  const [readingRemaining, setReadingRemaining] = useState(0)
  const [answerText, setAnswerText] = useState('')
  const [turnOutcome, setTurnOutcome] = useState(null)
  const [wrongAnswers, setWrongAnswers] = useState([])

  const availableSets = useMemo(
    () => questionSets.filter((set) => Number(set.grade) === Number(classroom.grade)),
    [questionSets, classroom.grade],
  )
  const bankQuestions = useMemo(() => {
    const unique = new Map()
    availableSets.flatMap((set) => set.questions ?? []).forEach((question) => {
      if (typeof question.statement !== 'string' || !question.statement.trim()) return
      if (typeof question.answer !== 'boolean' && typeof question.answer !== 'string') return
      const key = normalizeAnswer(question.statement)
      if (key && !unique.has(key)) unique.set(key, question)
    })
    return [...unique.values()]
  }, [availableSets])
  const boxCount = teamCount * QUESTIONS_PER_TEAM
  const currentQuestion = questionIndex === null ? null : questions[questionIndex]
  const currentTeam = teams[turnIndex]
  const maxScore = teams.length ? Math.max(...teams.map((team) => team.score)) : 0
  const winners = teams.filter((team) => team.score === maxScore)
  const hasEnoughStudents = classroom.students.length >= teamCount
  const editedQuestionsValid = generatedQuestions.length === boxCount
    && generatedQuestions.every((question) => (
      question.statement.trim()
      && question.explanation.trim()
      && (question.answerType === 'boolean'
        ? typeof question.booleanAnswer === 'boolean'
        : question.answerType === 'text' && question.textAnswer.trim())
    ))
  const uniqueGeneratedQuestions = new Set(generatedQuestions.map((question) => normalizeAnswer(question.statement))).size === generatedQuestions.length
  const canStart = questionSource === 'bank'
    ? bankQuestions.length >= boxCount
    : editedQuestionsValid && uniqueGeneratedQuestions

  async function generateQuestions() {
    const material = generationMaterial.trim()
    if (material.length < 3 || material.length > 120) {
      setGenerationStatus({ loading: false, error: 'Materi harus berisi 3–120 karakter.', message: '' })
      return
    }

    const generated = []
    setGenerationStatus({ loading: true, error: '', message: `Menyiapkan ${boxCount} soal...` })
    try {
      let attempts = 0
      while (generated.length < boxCount && attempts < 5) {
        attempts += 1
        const remaining = boxCount - generated.length
        const count = getNextBatchSize(remaining)
        setGenerationStatus({
          loading: true,
          error: '',
          message: `Membuat soal ${generated.length + 1}–${Math.min(boxCount, generated.length + count)} dari ${boxCount}...`,
        })
        const response = await fetch('/api/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade: Number(classroom.grade),
            subject: generationSubject,
            material,
            count,
            answerFormat: generationAnswerFormat,
            excludeStatements: generated.map((question) => question.statement),
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Soal belum berhasil dibuat. Silakan coba lagi.')
        if (!Array.isArray(result.questions) || result.questions.length > count
          || result.questions.some((question) => (
            typeof question?.statement !== 'string'
            || (generationAnswerFormat === 'boolean'
              ? typeof question?.answer !== 'boolean'
              : typeof question?.answer !== 'string' || !question.answer.trim())
            || typeof question?.explanation !== 'string'
            || !question.explanation.trim()
          ))) {
          throw new Error('Format soal dari layanan AI belum sesuai.')
        }
        for (const question of result.questions) {
          if (generated.length >= boxCount) break
          const statementKey = normalizeAnswer(question.statement)
          if (!statementKey || generated.some((item) => normalizeAnswer(item.statement) === statementKey)) continue
          generated.push(makeEditableQuestion({ ...question, id: `ai-${generated.length}-${Date.now()}` }))
        }
        setGeneratedQuestions([...generated])
        setQuestionSource('ai')
        if (result.questions.length === 0) break
      }
      setGenerationStatus({
        loading: false,
        error: '',
        message: generated.length === boxCount
          ? `${boxCount} soal siap. Periksa dan edit sebelum memulai.`
          : `AI menghasilkan ${generated.length} soal unik dari ${boxCount}. Tambahkan atau edit soal untuk melengkapi jumlahnya.`,
      })
    } catch (error) {
      setGenerationStatus({ loading: false, error: error.message || 'Terjadi kesalahan saat membuat soal.', message: '' })
    }
  }

  function startGame() {
    if (!hasEnoughStudents || !canStart) return
    const requestFullscreen = document.documentElement.requestFullscreen
    if (requestFullscreen) requestFullscreen.call(document.documentElement).catch(() => {})
    setTeams(splitStudents(classroom.students, teamCount))
    setQuestions(makeQuestionBoard(questionSource === 'ai' ? generatedQuestions : bankQuestions, boxCount))
    setQuestionIndex(null)
    setTurnIndex(0)
    setRoundStarterIndex(0)
    setPhase('selecting')
    setReadingRemaining(0)
    setAnswerText('')
    setTurnOutcome(null)
    setWrongAnswers([])
  }

  function nextTurn() {
    setAnswerText('')
    setTurnOutcome(null)
    if (phase === 'reading') {
      const lastReader = (roundStarterIndex + teams.length - 1) % teams.length
      if (turnIndex !== lastReader) {
        setTurnIndex((index) => (index + 1) % teams.length)
        return
      }
      setPhase('answering')
      setTurnIndex(roundStarterIndex)
      return
    }
    if (phase === 'answering' && turnIndex !== (roundStarterIndex + teams.length - 1) % teams.length) {
      setTurnIndex((index) => (index + 1) % teams.length)
      return
    }
    if (questionIndex + 1 < questions.length) {
      setQuestionIndex(null)
      setRoundStarterIndex((index) => (index + 1) % teams.length)
      setTurnIndex((index) => (index + 1) % teams.length)
      setPhase('selecting')
      return
    }

    setPhase('complete')
  }

  function selectQuestion(index) {
    if (phase !== 'selecting') return
    setQuestionIndex(index)
    setRoundStarterIndex(turnIndex)
    setReadingRemaining(readingDuration)
    setPhase('reading')
  }

  function submitAnswer(event) {
    event.preventDefault()
    if (!currentQuestion || !currentTeam || !answerText.trim() || turnOutcome) return
    const correct = answerMatches(currentQuestion, answerText)
    setTurnOutcome({ correct, submitted: answerText.trim() })
    if (correct) {
      setTeams((current) => current.map((team, index) => (
        index === turnIndex ? { ...team, score: team.score + 10 } : team
      )))
    } else {
      setWrongAnswers((current) => [...current, {
        question: currentQuestion.statement,
        expected: typeof currentQuestion.answer === 'boolean'
          ? (currentQuestion.answer ? 'Benar' : 'Salah')
          : currentQuestion.answer,
        teamName: currentTeam.name,
        answer: answerText.trim(),
        explanation: currentQuestion.explanation,
      }])
    }
  }

  function updateGeneratedQuestion(index, updates) {
    setGeneratedQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...updates } : question
    )))
  }

  function changeAnswerType(index, answerType) {
    setGeneratedQuestions((current) => current.map((question, questionIndex) => {
      if (questionIndex !== index) return question
      if (answerType === 'boolean') {
        const booleanAnswer = typeof question.booleanAnswer === 'boolean'
          ? question.booleanAnswer
          : typeof question.answer === 'boolean' ? question.answer : true
        return { ...question, answerType, booleanAnswer, answer: booleanAnswer }
      }
      const textAnswer = typeof question.textAnswer === 'string' && question.textAnswer.trim()
        ? question.textAnswer
        : typeof question.answer === 'string' && question.answer.trim()
          ? question.answer
          : typeof question.booleanAnswer === 'boolean'
            ? (question.booleanAnswer ? 'Benar' : 'Salah')
            : ''
      return { ...question, answerType, textAnswer, answer: textAnswer }
    }))
  }

  function addManualQuestion() {
    setGeneratedQuestions((current) => [...current, makeEditableQuestion({
      id: `teacher-${Date.now()}`,
      statement: '',
      answer: true,
      explanation: '',
    })])
  }

  function returnToSetup() {
    setPhase('setup')
    setTeams([])
    setQuestions([])
    setTurnOutcome(null)
    setQuestionIndex(0)
    setReadingRemaining(0)
  }

  useEffect(() => {
    if (phase !== 'reading') return undefined
    const timer = window.setInterval(() => {
      setReadingRemaining((remaining) => {
        if (remaining > 1) return remaining - 1
        setTurnIndex((current) => {
          const lastReader = (roundStarterIndex + teams.length - 1) % teams.length
          if (current !== lastReader) {
            setReadingRemaining(readingDuration)
            return (current + 1) % teams.length
          }
          setPhase('answering')
          setReadingRemaining(0)
          return roundStarterIndex
        })
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase, readingDuration, roundStarterIndex, teams.length])

  useEffect(() => {
    if (phase === 'setup') {
      document.body.classList.remove('clash-fullscreen-mode')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      return undefined
    }
    document.body.classList.add('clash-fullscreen-mode')
    return () => document.body.classList.remove('clash-fullscreen-mode')
  }, [phase])

  if (phase === 'setup') {
    return (
      <div className="page-section clash-page">
        <section className="page-title-row">
          <div>
            <button className="game-back-link" type="button" onClick={onBack}><ArrowLeft size={14} /> Semua permainan</button>
            <span className="eyebrow">STUDIO AKTIVITAS KELAS {classroom.name}</span>
            <h1>Clash of Clan <span className="title-sparkle">✳</span></h1>
            <p>Bangun strategi tim, kuasai soal, dan rebut piala juara.</p>
          </div>
          <span className="game-ready-badge"><span /> {boxCount} KOTAK SOAL</span>
        </section>

        <section className="clash-setup-card">
          <div className="clash-setup-intro">
            <span className="clash-crest"><Shield size={24} /></span>
            <div><span className="eyebrow">ARENA PENGETAHUAN</span><h2>Siapkan pasukanmu</h2><p>Tim yang mendapat giliran memilih kotak lalu membaca terlebih dahulu sampai waktu habis. Tim berikutnya membaca secara berurutan, kemudian semua tim menjawab dengan urutan yang sama.</p></div>
          </div>
          <div className="clash-setup-fields">
            <label className="setup-label">Jumlah tim
              <span className="setup-hint">Pilih 2–6 tim; setiap tim harus mendapat anggota.</span>
              <select className="treasure-select" value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))} disabled={generationStatus.loading}>
                {Array.from({ length: 5 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} tim</option>)}
              </select>
            </label>
            <label className="setup-label">Sumber soal
              <span className="setup-hint">{questionSource === 'bank' ? `${bankQuestions.length} soal bank tersedia untuk kelas ${classroom.grade}.` : `${generatedQuestions.length} dari ${boxCount} soal ${questionSource === 'ai' ? 'AI' : 'manual'} tersedia.`}</span>
              <select className="treasure-select" value={questionSource} onChange={(event) => setQuestionSource(event.target.value)} disabled={generationStatus.loading}>
                <option value="bank">Bank soal kelas {classroom.grade}</option>
                <option value="ai">Soal AI yang bisa diedit</option>
                <option value="manual">Buat/edit soal manual</option>
              </select>
            </label>
            <label className="setup-label">Waktu membaca per tim
              <span className="setup-hint">Setiap tim membaca soal selama waktu ini.</span>
              <select className="treasure-select" value={readingDuration} onChange={(event) => setReadingDuration(Number(event.target.value))} disabled={generationStatus.loading}>
                <option value="15">15 detik</option>
                <option value="30">30 detik</option>
                <option value="45">45 detik</option>
                <option value="60">60 detik</option>
              </select>
            </label>
          </div>
          {!hasEnoughStudents && <div className="form-error treasure-error"><CircleHelp size={16} />Tambahkan setidaknya {teamCount} siswa agar setiap tim mendapat anggota.</div>}
          {questionSource === 'bank' && bankQuestions.length < boxCount && <div className="form-error treasure-error"><CircleHelp size={16} />Bank soal memiliki {bankQuestions.length} soal berbeda, sedangkan {teamCount} tim memerlukan {boxCount}. Buat soal tambahan dengan AI atau kurangi jumlah tim.</div>}
          <section className="treasure-ai-generator clash-ai-generator" aria-label="Buat soal Clash of Clan dengan AI">
            <div><span className="eyebrow">BUAT SOAL DENGAN DEEPSEEK</span><p>Pilih satu format untuk seluruh batch AI. Soal AI hanya dipakai pada sesi ini dan dapat diedit sebelum permainan; dibutuhkan enam soal per tim.</p></div>
            <div className="treasure-ai-fields">
              <label className="setup-label">Mata pelajaran
                <select className="treasure-select" value={generationSubject} onChange={(event) => setGenerationSubject(event.target.value)} disabled={generationStatus.loading}>
                  {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
              </label>
              <label className="setup-label">Materi
                <input className="treasure-material-input" type="text" minLength={3} maxLength={120} placeholder="Contoh: sistem pencernaan manusia" value={generationMaterial} onChange={(event) => setGenerationMaterial(event.target.value)} disabled={generationStatus.loading} />
              </label>
              <label className="setup-label">Format jawaban AI
                <select className="treasure-select" value={generationAnswerFormat} onChange={(event) => setGenerationAnswerFormat(event.target.value)} disabled={generationStatus.loading}>
                  <option value="boolean">Semua Benar / Salah</option>
                  <option value="text">Semua isian teks</option>
                </select>
              </label>
              <button className="button button-outline treasure-generate-button" type="button" onClick={generateQuestions} disabled={generationStatus.loading || generationMaterial.trim().length < 3}>
                {generationStatus.loading ? <><LoaderCircle className="spin" size={15} /> Membuat soal...</> : <><Sparkles size={15} /> Buat {boxCount} soal {generationAnswerFormat === 'boolean' ? 'Benar/Salah' : 'isian teks'}</>}
              </button>
            </div>
            {generationStatus.message && <p className="treasure-generation-message" role="status">{generationStatus.message}</p>}
            {generationStatus.error && <div className="form-error treasure-error" role="alert"><CircleHelp size={16} />{generationStatus.error}</div>}
            {questionSource !== 'bank' && (
              <section className="treasure-question-editor clash-question-editor" aria-label="Editor soal Clash of Clan">
                <div className="treasure-editor-heading">
                  <div><strong>{questionSource === 'ai' ? 'Periksa dan edit soal AI' : 'Tulis dan edit soal'}</strong><span>{generatedQuestions.length} dari {boxCount} soal · pernyataan harus unik</span></div>
                  <button className="button button-outline" type="button" onClick={addManualQuestion} disabled={generationStatus.loading || generatedQuestions.length >= boxCount}>Tambah soal manual</button>
                </div>
                <div className="treasure-question-editor-list">
                  {generatedQuestions.map((question, index) => (
                    <article className="treasure-question-editor-card" key={question.id ?? index}>
                      <div className="treasure-question-editor-top"><strong>Soal {index + 1}</strong><button className="treasure-remove-question" type="button" onClick={() => setGeneratedQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))} disabled={generationStatus.loading}><X size={15} /> Hapus</button></div>
                      <label className="setup-label">Pernyataan<textarea className="treasure-question-edit-input clash-rich-editor" value={question.statement} maxLength={1000} rows={3} placeholder={'Tulis teks, atau rumus seperti $x^2$ dan $\\frac{1}{2}$'} onChange={(event) => updateGeneratedQuestion(index, { statement: event.target.value })} /></label>
                      <div className="clash-editor-preview"><span>Pratinjau soal</span><RichText text={question.statement || 'Teks dan rumus akan tampil di sini.'} /></div>
                      <div className="treasure-question-editor-fields">
                        <label className="setup-label">Jenis jawaban<select className="treasure-select" value={question.answerType} onChange={(event) => changeAnswerType(index, event.target.value)}><option value="boolean">Benar / Salah</option><option value="text">Teks bebas</option></select></label>
                        {question.answerType === 'boolean'
                          ? <label className="setup-label">Jawaban<select className="treasure-select" value={String(question.booleanAnswer)} onChange={(event) => { const booleanAnswer = event.target.value === 'true'; updateGeneratedQuestion(index, { booleanAnswer, answer: booleanAnswer }) }}><option value="true">Benar</option><option value="false">Salah</option></select></label>
                          : <label className="setup-label">Jawaban<textarea className="treasure-question-edit-input clash-rich-editor" value={question.textAnswer} maxLength={300} rows={2} placeholder={'Jawaban yang diterima (pisahkan alternatif dengan ; atau |)'} onChange={(event) => updateGeneratedQuestion(index, { textAnswer: event.target.value, answer: event.target.value })} /></label>}
                        <label className="setup-label">Penjelasan<textarea className="treasure-question-edit-input clash-rich-editor" value={question.explanation} maxLength={1000} rows={2} placeholder="Penjelasan (mendukung rumus LaTeX)" onChange={(event) => updateGeneratedQuestion(index, { explanation: event.target.value })} /></label>
                      </div>
                      <div className="clash-editor-preview"><span>Pratinjau jawaban & penjelasan</span><RichText text={`${question.answerType === 'boolean' ? (question.booleanAnswer ? 'Benar' : 'Salah') : (question.textAnswer || 'Jawaban akan tampil di sini.')}${question.explanation ? `\n${question.explanation}` : ''}`} /></div>
                    </article>
                  ))}
                </div>
                {(!editedQuestionsValid || !uniqueGeneratedQuestions) && <p className="treasure-editor-validation" role="alert">Lengkapi pernyataan, jawaban, dan penjelasan, lalu pastikan semua pernyataan berbeda.</p>}
              </section>
            )}
          </section>
          <div className="treasure-setup-footer">
            <span><UsersRound size={16} /> {classroom.students.length} siswa · {boxCount} soal · {QUESTIONS_PER_TEAM} soal per tim</span>
            <button className="button button-primary" type="button" onClick={startGame} disabled={generationStatus.loading || !hasEnoughStudents || !canStart}>Bentuk tim & mulai <Sparkles size={16} /></button>
          </div>
        </section>
      </div>
    )
  }

  if (phase === 'complete') {
    return (
      <div className="page-section clash-page clash-results">
        <section className="clash-results-hero">
          <span className="clash-trophy"><Trophy size={35} /></span>
          <span className="eyebrow">PERTEMPURAN SELESAI</span>
          <h1>{winners.length === 1 ? `${winners[0].name} berjaya!` : 'Hasil imbang!'}</h1>
          <p>{winners.length === 1 ? `Juara arena dengan ${maxScore} poin.` : `Beberapa tim berbagi posisi teratas dengan ${maxScore} poin.`}</p>
          <div className="clash-result-cups">{teams.slice().sort((a, b) => b.score - a.score).map((team, index) => (
            <div className={`clash-result-team ${index === 0 ? 'is-champion' : ''}`} key={team.id} style={{ '--team-color': team.color }}>
              <span className="clash-result-medal">{index === 0 ? <Crown size={21} /> : index + 1}</span><strong>{team.name}</strong><span>{team.score} poin</span>
            </div>
          ))}</div>
        </section>
        <section className="clash-reflection">
          <div className="clash-reflection-heading"><div><span className="eyebrow">BELAJAR DARI ARENA</span><h2>Refleksi jawaban</h2></div><span>{wrongAnswers.length} jawaban salah</span></div>
          {wrongAnswers.length ? <div className="clash-reflection-list">{wrongAnswers.map((item, index) => (
            <article className="clash-reflection-item" key={`${item.teamName}-${index}`}>
              <span className="clash-reflection-mark"><X size={16} /></span><div><strong><RichText text={item.question} /></strong><p>{item.teamName} menjawab “{item.answer}” · jawaban yang diharapkan: <b><RichText text={item.expected} /></b></p>{item.explanation && <small><RichText text={item.explanation} /></small>}</div>
            </article>
          ))}</div> : <p className="clash-all-correct"><Check size={17} /> Hebat! Semua tim menjawab dengan benar.</p>}
          <div className="clash-results-actions"><button className="button button-outline" type="button" onClick={returnToSetup}>Main lagi</button><button className="button button-primary" type="button" onClick={onBack}>Kembali ke Studio</button></div>
        </section>
      </div>
    )
  }

  const answerTurnComplete = turnOutcome !== null
  const currentQuestionDone = phase === 'answering' && answerTurnComplete && turnIndex === (roundStarterIndex + teams.length - 1) % teams.length
  return (
    <div className="page-section clash-page clash-arena">
      <section className="clash-arena-header">
        <div><button className="game-back-link" type="button" onClick={returnToSetup}><ArrowLeft size={14} /> Pengaturan permainan</button><span className="eyebrow">CLASH OF CLAN · KELAS {classroom.name}</span><h1>Arena pengetahuan</h1></div>
        <div className="clash-question-progress"><strong>{questionIndex + 1}<small>/{questions.length}</small></strong><span>KOTAK SOAL</span></div>
      </section>
      <section className="clash-scoreboard" aria-label="Papan skor tim">
        {teams.map((team, index) => (
          <article className={`clash-score-card ${currentTeam?.id === team.id ? 'is-current' : ''}`} key={team.id} style={{ '--team-color': team.color }}>
            <div className="clash-score-top"><span className="clash-team-emblem">{index === 0 ? <Crown size={17} /> : <Shield size={17} />}</span><span className="clash-team-rank">#{teams.slice().sort((a, b) => b.score - a.score).findIndex((rankedTeam) => rankedTeam.id === team.id) + 1}</span></div>
            <strong>{team.name}</strong><span className="clash-team-students">{team.students.length} anggota</span>
            <div className="clash-score-meter"><span style={{ width: `${maxScore ? Math.max(8, (team.score / maxScore) * 100) : 5}%` }} /></div>
            <div className="clash-score-value"><b>{team.score}</b><small>POIN</small></div>
          </article>
        ))}
      </section>
      <section className="clash-round-status" aria-live="polite">
        <span className={`clash-phase-badge ${phase === 'reading' ? 'reading' : phase === 'selecting' ? 'selecting' : 'answering'}`}>{phase === 'selecting' ? 'PILIH KOTAK' : phase === 'reading' ? 'RONDE MEMBACA' : 'RONDE MENJAWAB'}</span>
        <strong>{currentTeam?.name}</strong>
        <span>{phase === 'selecting' ? 'Pilih satu kotak soal secara bebas' : `Giliran ${turnIndex + 1} dari ${teams.length} tim`}</span>
        <span className="clash-step-track">{teams.map((team, index) => <i className={index < turnIndex || turnOutcome && index === turnIndex ? 'is-done' : index === turnIndex ? 'is-active' : ''} key={team.id} style={{ '--team-color': team.color }} />)}</span>
      </section>
      <section className="clash-question-card">
        <div className="clash-question-card-top"><span>{questionIndex === null ? 'PILIH KOTAK' : `KOTAK ${String(questionIndex + 1).padStart(2, '0')}`}</span><span>{phase === 'selecting' ? 'GILIRAN MEMILIH' : phase === 'reading' ? 'BACA DENGAN NYARING' : 'JAWABAN TIM'}</span></div>
        {phase === 'selecting' ? (
          <div className="clash-turn-action"><p><strong>{currentTeam?.name}</strong>, pilih kotak soal yang ingin dimainkan terlebih dahulu.</p><button className="button button-outline clash-fullscreen-button" type="button" onClick={() => { const requestFullscreen = document.documentElement.requestFullscreen; if (requestFullscreen) requestFullscreen.call(document.documentElement).catch(() => {}) }}><Expand size={15} /> Layar penuh</button></div>
        ) : phase === 'reading' ? (
          <><h2><RichText text={currentQuestion?.statement} /></h2><div className="clash-reading-timer"><Clock3 size={18} /><strong>{readingRemaining}</strong><span>DETIK · {currentTeam?.name} MEMBACA</span></div></>
        ) : (
          <><h2><RichText text={currentQuestion?.statement} /></h2>
          <form className="clash-answer-form" onSubmit={submitAnswer}>
            <label htmlFor="clash-answer-input">Jawaban {currentTeam?.name}<span>Jawaban Benar/Salah dapat ditulis sebagai “Benar” atau “Salah”.</span></label>
            <div className="clash-answer-controls"><input id="clash-answer-input" autoComplete="off" value={answerText} onChange={(event) => setAnswerText(event.target.value)} placeholder="Ketik jawaban tim..." disabled={answerTurnComplete} required /><button className="button button-primary" type="submit" disabled={!answerText.trim() || answerTurnComplete}>Kirim jawaban <ArrowLeft size={15} /></button></div>
            {turnOutcome && <div className={`clash-answer-feedback ${turnOutcome.correct ? 'is-correct' : 'is-wrong'}`} role="status">{turnOutcome.correct ? <Check size={18} /> : <X size={18} />}<div><strong>{turnOutcome.correct ? 'Jawaban benar! +10 poin' : 'Jawaban salah — giliran ditutup'}</strong><span>Jawaban yang tepat: <RichText text={typeof currentQuestion.answer === 'boolean' ? (currentQuestion.answer ? 'Benar' : 'Salah') : currentQuestion.answer} />{currentQuestion.explanation ? <> · <RichText text={currentQuestion.explanation} /></> : ''}</span></div></div>}
            {answerTurnComplete && <button className="button button-primary clash-next-turn" type="button" onClick={nextTurn}>{currentQuestionDone ? questionIndex + 1 === questions.length ? 'Lihat hasil & refleksi' : 'Kotak berikutnya' : 'Tim berikutnya'} <ArrowLeft size={15} /></button>}
          </form>
          </>
        )}
      </section>
      <section className="clash-box-board">
        <div className="clash-box-board-heading"><div><span className="eyebrow">PETA PERTEMPURAN</span><strong>{questions.length} kotak · 6 soal untuk setiap tim</strong></div><span>Soal terjawab {phase === 'answering' ? questionIndex : 0} / {questions.length}</span></div>
        <div className="clash-question-boxes">{questions.map((question, index) => {
          const missed = wrongAnswers.some((item) => item.question === question.statement)
          return <button type="button" className={`clash-question-box ${index === questionIndex ? 'is-current' : ''} ${index < questionIndex && phase !== 'selecting' ? 'is-cleared' : ''} ${missed ? 'is-missed' : ''}`} key={question.id ?? index} onClick={() => selectQuestion(index)} disabled={phase !== 'selecting'} aria-label={`Pilih kotak ${index + 1}${missed ? ', ada jawaban salah' : ''}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>{missed ? <X size={14} /> : index < questionIndex && phase !== 'selecting' ? <Check size={14} /> : index === questionIndex ? <Sparkles size={14} /> : <Shield size={13} />}
          </button>
        })}</div>
      </section>
    </div>
  )
}

export default ClashOfClanGame
