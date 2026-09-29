import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  authenticateAdministrator,
  authenticateTeacher,
  createTeacherClass,
  createTeacherStudent,
  createAdministratorSession,
  createTeacherSession,
  createQuestionSet,
  database,
  databasePath,
  deleteTeacherClass,
  deleteTeacherStudent,
  deleteAdministratorStudent,
  deleteAdministratorTeacher,
  deleteQuestionSet,
  getSessionTeacher,
  getSessionAdministrator,
  getTeacherClasses,
  getTeacherQuestionSets,
  getAdminOverview,
  importTeacherStudents,
  hasTeacherClassName,
  revokeTeacherSession,
  revokeAdministratorSession,
  updateSchoolName,
  teacherOwnsClass,
  updateTeacherClass,
  updateTeacherStudent,
} from './server/database.js'

const app = express()
const port = Number(process.env.PORT) || 3001
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const allowedSubjects = new Set([
  'IPAS',
  'Matematika',
  'Bahasa Indonesia',
  'Pendidikan Pancasila',
  'Bahasa Inggris',
  'Seni Budaya',
])

app.use(express.json({ limit: '1mb' }))

function getSessionToken(request) {
  const cookie = request.headers.cookie
  if (!cookie) return null
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('ruangmain_session='))
  return entry ? entry.slice('ruangmain_session='.length) : null
}

function requireTeacher(request, response, next) {
  const teacher = getSessionTeacher(getSessionToken(request))
  if (!teacher) return response.status(401).json({ error: 'Sesi guru berakhir. Silakan masuk kembali.' })
  request.teacher = teacher
  return next()
}

function requireAdministrator(request, response, next) {
  const administrator = getSessionAdministrator(getSessionToken(request))
  if (!administrator) return response.status(401).json({ error: 'Sesi admin berakhir. Silakan masuk kembali.' })
  request.administrator = administrator
  return next()
}

function requireSessionUser(request, response, next) {
  const token = getSessionToken(request)
  const administrator = getSessionAdministrator(token)
  const teacher = administrator ? null : getSessionTeacher(token)
  if (!administrator && !teacher) return response.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' })
  request.sessionUser = administrator ? { ...administrator, role: 'admin' } : { ...teacher, role: 'teacher' }
  return next()
}

app.get('/api/status', (_request, response) => {
  response.json({ configured: Boolean(process.env.DEEPSEEK_API_KEY), database: 'SQLite' })
})

app.post('/api/login', (request, response) => {
  const { email, password } = request.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    return response.status(400).json({ error: 'Email dan kata sandi harus diisi.' })
  }

  const administrator = authenticateAdministrator(email, password)
  const teacher = administrator ? null : authenticateTeacher(email, password)
  if (!administrator && !teacher) {
    return response.status(401).json({ error: 'Email atau kata sandi tidak cocok. Periksa kembali data masuk Anda.' })
  }

  const user = administrator ? { ...administrator, role: 'admin' } : { ...teacher, role: 'teacher' }
  const session = administrator
    ? createAdministratorSession(administrator.id)
    : createTeacherSession(teacher.id)
  response.cookie('ruangmain_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: session.expiresAt - Date.now(),
    path: '/',
  })
  return response.json({ user })
})

app.delete('/api/session', requireSessionUser, (request, response) => {
  revokeTeacherSession(getSessionToken(request))
  revokeAdministratorSession(getSessionToken(request))
  response.clearCookie('ruangmain_session', { httpOnly: true, sameSite: 'lax', path: '/' })
  return response.status(204).end()
})

app.get('/api/settings', requireTeacher, (_request, response) => {
  return response.json({ schoolName: getAdminOverview().schoolName })
})

app.get('/api/admin/overview', requireAdministrator, (_request, response) => {
  return response.json(getAdminOverview())
})

app.put('/api/admin/school', requireAdministrator, (request, response) => {
  const { name } = request.body ?? {}
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
    return response.status(400).json({ error: 'Nama sekolah harus berisi 2–120 karakter.' })
  }
  try {
    updateSchoolName(name.trim())
    return response.json({ schoolName: getAdminOverview().schoolName })
  } catch (error) {
    console.error('Failed to update the school name:', error)
    return response.status(500).json({ error: 'Nama sekolah belum dapat disimpan.' })
  }
})

app.delete('/api/admin/teachers/:id', requireAdministrator, (request, response) => {
  if (!database.prepare('SELECT 1 FROM teachers WHERE id = ?').get(request.params.id)) {
    return response.status(404).json({ error: 'Guru tidak ditemukan.' })
  }
  if (database.prepare('SELECT COUNT(*) AS total FROM teachers').get().total <= 1) {
    return response.status(409).json({ error: 'Guru terakhir tidak dapat dihapus.' })
  }
  try {
    deleteAdministratorTeacher(request.params.id)
    return response.json(getAdminOverview())
  } catch (error) {
    console.error('Failed to delete a teacher account:', error)
    return response.status(500).json({ error: 'Akun guru belum dapat dihapus.' })
  }
})

app.delete('/api/admin/students/:id', requireAdministrator, (request, response) => {
  try {
    if (!deleteAdministratorStudent(request.params.id)) {
      return response.status(404).json({ error: 'Murid tidak ditemukan.' })
    }
    return response.json(getAdminOverview())
  } catch (error) {
    console.error('Failed to delete a student as an administrator:', error)
    return response.status(500).json({ error: 'Data murid belum dapat dihapus.' })
  }
})

app.get('/api/classes', requireTeacher, (request, response) => {
  return response.json({ classes: getTeacherClasses(request.teacher.id) })
})

app.post('/api/classes', requireTeacher, (request, response) => {
  const { name, grade } = request.body ?? {}
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 40) {
    return response.status(400).json({ error: 'Nama kelas harus berisi 1–40 karakter.' })
  }
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
    return response.status(400).json({ error: 'Pilih tingkat kelas antara 1 dan 6.' })
  }
  if (hasTeacherClassName(request.teacher.id, name.trim())) {
    return response.status(409).json({ error: 'Nama kelas tersebut sudah digunakan.' })
  }

  try {
    createTeacherClass({
      id: `kelas-${randomUUID()}`,
      teacherId: request.teacher.id,
      name: name.trim(),
      grade,
    })
    return response.status(201).json({ classes: getTeacherClasses(request.teacher.id) })
  } catch (error) {
    console.error('Failed to create a teacher class:', error)
    return response.status(500).json({ error: 'Kelas belum dapat disimpan.' })
  }
})

app.patch('/api/classes/:id', requireTeacher, (request, response) => {
  const { name, grade } = request.body ?? {}
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 40) {
    return response.status(400).json({ error: 'Nama kelas harus berisi 1–40 karakter.' })
  }
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
    return response.status(400).json({ error: 'Pilih tingkat kelas antara 1 dan 6.' })
  }
  if (!teacherOwnsClass(request.params.id, request.teacher.id)) {
    return response.status(404).json({ error: 'Kelas tidak ditemukan.' })
  }
  if (hasTeacherClassName(request.teacher.id, name.trim(), request.params.id)) {
    return response.status(409).json({ error: 'Nama kelas tersebut sudah digunakan.' })
  }

  try {
    updateTeacherClass(request.params.id, request.teacher.id, { name: name.trim(), grade })
    return response.json({ classes: getTeacherClasses(request.teacher.id) })
  } catch (error) {
    console.error('Failed to update a teacher class:', error)
    return response.status(500).json({ error: 'Perubahan kelas belum dapat disimpan.' })
  }
})

app.delete('/api/classes/:id', requireTeacher, (request, response) => {
  if (!teacherOwnsClass(request.params.id, request.teacher.id)) {
    return response.status(404).json({ error: 'Kelas tidak ditemukan.' })
  }
  if (getTeacherClasses(request.teacher.id).length <= 1) {
    return response.status(409).json({ error: 'Guru harus memiliki setidaknya satu kelas.' })
  }
  try {
    deleteTeacherClass(request.params.id, request.teacher.id)
    return response.json({ classes: getTeacherClasses(request.teacher.id) })
  } catch (error) {
    console.error('Failed to delete a teacher class:', error)
    return response.status(500).json({ error: 'Kelas belum dapat dihapus.' })
  }
})

app.post('/api/students', requireTeacher, (request, response) => {
  const { classId, name } = request.body ?? {}
  if (typeof classId !== 'string' || !teacherOwnsClass(classId, request.teacher.id)) {
    return response.status(404).json({ error: 'Kelas tujuan tidak ditemukan.' })
  }
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    return response.status(400).json({ error: 'Nama murid harus berisi 1–100 karakter.' })
  }
  try {
    createTeacherStudent({ id: `murid-${randomUUID()}`, classId, name: name.trim() }, request.teacher.id)
    return response.status(201).json({ classes: getTeacherClasses(request.teacher.id) })
  } catch (error) {
    console.error('Failed to create a teacher student:', error)
    return response.status(500).json({ error: 'Murid belum dapat ditambahkan.' })
  }
})

app.patch('/api/students/:id', requireTeacher, (request, response) => {
  const { classId, name } = request.body ?? {}
  if (typeof classId !== 'string' || !teacherOwnsClass(classId, request.teacher.id)) {
    return response.status(404).json({ error: 'Kelas tujuan tidak ditemukan.' })
  }
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    return response.status(400).json({ error: 'Nama murid harus berisi 1–100 karakter.' })
  }
  try {
    if (!updateTeacherStudent(request.params.id, request.teacher.id, { classId, name: name.trim() })) {
      return response.status(404).json({ error: 'Murid tidak ditemukan pada kelas yang Anda kelola.' })
    }
    return response.json({ classes: getTeacherClasses(request.teacher.id) })
  } catch (error) {
    console.error('Failed to update a teacher student:', error)
    return response.status(500).json({ error: 'Perubahan data murid belum dapat disimpan.' })
  }
})

app.delete('/api/students/:id', requireTeacher, (request, response) => {
  try {
    if (!deleteTeacherStudent(request.params.id, request.teacher.id)) {
      return response.status(404).json({ error: 'Murid tidak ditemukan pada kelas yang Anda kelola.' })
    }
    return response.json({ classes: getTeacherClasses(request.teacher.id) })
  } catch (error) {
    console.error('Failed to delete a teacher student:', error)
    return response.status(500).json({ error: 'Murid belum dapat dihapus.' })
  }
})

app.post('/api/students/import', requireTeacher, (request, response) => {
  const { students } = request.body ?? {}
  if (!Array.isArray(students) || students.length < 1 || students.length > 1000) {
    return response.status(400).json({ error: 'Pilih berkas dengan 1–1.000 baris murid.' })
  }
  const invalidRow = students.findIndex((student) => (
    !student
    || typeof student.name !== 'string'
    || student.name.trim().length < 1
    || student.name.trim().length > 100
    || typeof student.classId !== 'string'
    || !teacherOwnsClass(student.classId, request.teacher.id)
  ))
  if (invalidRow !== -1) {
    return response.status(400).json({ error: `Data murid pada baris ${invalidRow + 2} tidak valid atau kelas tidak dikelola oleh akun ini.` })
  }
  try {
    const result = importTeacherStudents(
      students.map((student) => ({ name: student.name.trim(), classId: student.classId })),
      request.teacher.id,
    )
    return response.status(201).json({ ...result, classes: getTeacherClasses(request.teacher.id) })
  } catch (error) {
    console.error('Failed to import students from a spreadsheet:', error)
    return response.status(500).json({ error: 'Daftar murid belum dapat diimpor. Tidak ada perubahan yang disimpan.' })
  }
})

app.get('/api/question-sets', requireTeacher, (request, response) => {
  return response.json({ questionSets: getTeacherQuestionSets(request.teacher.id) })
})

app.post('/api/question-sets', requireTeacher, (request, response) => {
  const { title, grade, subject, material, questions } = request.body ?? {}
  if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 180) {
    return response.status(400).json({ error: 'Judul paket harus berisi 3–180 karakter.' })
  }
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
    return response.status(400).json({ error: 'Pilih tingkat kelas antara 1 dan 6.' })
  }
  if (typeof subject !== 'string' || !allowedSubjects.has(subject)) {
    return response.status(400).json({ error: 'Pilih mata pelajaran yang tersedia.' })
  }
  if (typeof material !== 'string' || material.trim().length < 3 || material.trim().length > 180) {
    return response.status(400).json({ error: 'Materi harus berisi 3–180 karakter.' })
  }
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 10) {
    return response.status(400).json({ error: 'Paket harus memiliki 1–10 soal.' })
  }
  const validQuestions = questions.every((question) => (
    question
    && typeof question.id === 'string'
    && typeof question.statement === 'string'
    && question.statement.trim().length > 0
    && typeof question.answer === 'boolean'
    && typeof question.explanation === 'string'
  ))
  if (!validQuestions) {
    return response.status(400).json({ error: 'Format soal belum sesuai.' })
  }

  const questionSet = {
    id: `paket-${randomUUID()}`,
    teacherId: request.teacher.id,
    title: title.trim(),
    grade,
    subject,
    material: material.trim(),
    createdAt: new Date().toISOString(),
    questions: questions.map((question, index) => ({
      id: `soal-${randomUUID()}-${index}`,
      statement: question.statement.trim(),
      answer: question.answer,
      explanation: question.explanation.trim(),
    })),
  }
  try {
    createQuestionSet(questionSet)
    return response.status(201).json({ questionSet })
  } catch (error) {
    console.error('Failed to save a question set to SQLite:', error)
    return response.status(500).json({ error: 'Paket soal belum dapat disimpan ke database.' })
  }
})

app.delete('/api/question-sets/:id', requireTeacher, (request, response) => {
  if (!deleteQuestionSet(request.params.id, request.teacher.id)) {
    return response.status(404).json({ error: 'Paket soal tidak ditemukan.' })
  }
  return response.status(204).end()
})

app.post('/api/generate-questions', requireTeacher, async (request, response) => {
  const { grade, subject, material, count, answerFormat = 'boolean', excludeStatements = [] } = request.body ?? {}
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
    return response.status(400).json({ error: 'Pilih tingkat kelas antara 1 dan 6.' })
  }
  if (typeof subject !== 'string' || !allowedSubjects.has(subject)) {
    return response.status(400).json({ error: 'Pilih mata pelajaran yang tersedia.' })
  }
  if (typeof material !== 'string' || material.trim().length < 3 || material.trim().length > 180) {
    return response.status(400).json({ error: 'Materi harus berisi 3–180 karakter.' })
  }
  if (!Number.isInteger(count) || ![3, 5, 8, 10].includes(count)) {
    return response.status(400).json({ error: 'Pilih jumlah soal yang tersedia.' })
  }
  if (!['boolean', 'text'].includes(answerFormat)) {
    return response.status(400).json({ error: 'Pilih format jawaban yang tersedia.' })
  }
  if (!Array.isArray(excludeStatements) || excludeStatements.length > 40
    || excludeStatements.some((statement) => typeof statement !== 'string' || statement.length > 500)) {
    return response.status(400).json({ error: 'Daftar pernyataan yang harus dihindari tidak valid.' })
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    return response.status(503).json({
      error: 'Kunci DeepSeek belum dikonfigurasi. Salin .env.example menjadi .env, isi DEEPSEEK_API_KEY, lalu jalankan ulang server.',
    })
  }

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'Kamu adalah guru sekolah dasar Indonesia yang teliti dan kreatif.',
              answerFormat === 'text'
                ? 'Buat pertanyaan isian teks yang akurat, jelas, sesuai usia kelas, dan hanya membahas materi yang diberikan.'
                : 'Buat pernyataan benar/salah yang akurat, jelas, sesuai usia kelas, dan hanya membahas materi yang diberikan.',
              answerFormat === 'text'
                ? 'Setiap answer harus berupa string jawaban singkat. Jika ada ejaan atau nama alternatif yang sama-sama benar, pisahkan dengan tanda |. Jangan membuat soal pilihan ganda.'
                : 'Setiap answer harus berupa boolean JSON true atau false. Variasikan jawaban benar dan salah secara seimbang.',
              'Hindari pernyataan ambigu, menjebak, atau memuat fakta yang tidak tepat.',
              'Hindari pertanyaan ambigu atau fakta yang tidak tepat.',
              'Berikan penjelasan singkat dan ramah anak untuk setiap jawaban.',
              answerFormat === 'text'
                ? 'Kembalikan JSON valid saja dengan bentuk {"questions":[{"statement":"...","answer":"jawaban|alternatif","explanation":"..."}]}. Semua answer harus string.'
                : 'Kembalikan JSON valid saja dengan bentuk {"questions":[{"statement":"...","answer":true,"explanation":"..."}]}. Semua answer harus boolean JSON true atau false.',
              'Jangan sertakan markdown.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              answerFormat === 'text'
                ? `Buat ${count} soal isian teks baru untuk kelas ${grade} SD, mata pelajaran ${subject}, dengan materi: ${material.trim()}. Semua soal harus dijawab dengan teks singkat.`
                : `Buat ${count} pernyataan benar/salah yang baru untuk kelas ${grade} SD, mata pelajaran ${subject}, dengan materi: ${material.trim()}.`,
              excludeStatements.length
                ? `Jangan mengulang atau hanya mengubah sedikit kata dari pernyataan berikut; pilih fakta dan sudut bahasan yang berbeda: ${JSON.stringify(excludeStatements)}`
                : '',
            ].filter(Boolean).join(' '),
          },
        ],
      }),
    })

    if (!upstream.ok) {
      const upstreamMessage = await upstream.text()
      console.error(`DeepSeek API returned ${upstream.status}: ${upstreamMessage.slice(0, 500)}`)
      return response.status(502).json({ error: 'Layanan DeepSeek belum dapat membuat soal. Periksa konfigurasi API atau coba lagi nanti.' })
    }

    const result = await upstream.json()
    const content = result.choices?.[0]?.message?.content
    const jsonContent = typeof content === 'string'
      ? content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      : ''
    const parsed = jsonContent ? JSON.parse(jsonContent) : null
    const questions = parsed?.questions
    const normalizedQuestions = Array.isArray(questions)
      ? questions.map((question) => {
        if (!question || typeof question !== 'object') return null
        const rawAnswer = question.answer ?? question.answerText ?? question.correctAnswer
        const answer = answerFormat === 'text'
          ? Array.isArray(rawAnswer)
            ? rawAnswer.filter((item) => item !== null && item !== undefined).map(String).join('|')
            : typeof rawAnswer === 'string' ? rawAnswer : rawAnswer === null || rawAnswer === undefined ? '' : String(rawAnswer)
          : rawAnswer
        return {
          statement: typeof question.statement === 'string' ? question.statement.trim() : '',
          answer,
          explanation: typeof question.explanation === 'string' ? question.explanation.trim() : '',
        }
      })
      : []
    const validQuestions = normalizedQuestions.length > 0
      && normalizedQuestions.length <= count
      && normalizedQuestions.every((question) => (
        question
        && question.statement.length > 0
        && (answerFormat === 'boolean'
          ? typeof question.answer === 'boolean'
          : typeof question.answer === 'string' && question.answer.trim().length > 0)
        && question.explanation.length > 0
      ))

    if (!validQuestions) {
      console.error('DeepSeek returned a question response with an invalid shape.')
      return response.status(502).json({ error: 'Format soal dari layanan AI belum sesuai. Silakan coba buat ulang.' })
    }

    return response.json({
      questions: normalizedQuestions.map((question, index) => ({
        id: `q-${index + 1}`,
        statement: question.statement,
        answer: question.answer,
        explanation: question.explanation,
      })),
    })
  } catch (error) {
    console.error('Failed to generate questions with DeepSeek:', error)
    return response.status(502).json({ error: 'Tidak dapat menghubungi layanan AI. Periksa koneksi internet, lalu coba lagi.' })
  }
})

const buildDirectory = path.join(currentDirectory, 'dist')
app.use(express.static(buildDirectory))
app.get(/.*/, (_request, response) => response.sendFile(path.join(buildDirectory, 'index.html')))

app.listen(port, () => {
  console.log(`Ruangmain server ready at http://localhost:${port}`)
  console.log(`SQLite database: ${databasePath}`)
})
