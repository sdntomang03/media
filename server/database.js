import Database from 'better-sqlite3'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { administrators, seedClasses, seedQuestionSets, teachers } from '../src/data/seed.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const databasePath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(currentDirectory, '..', 'data', 'ruangmain.sqlite')

mkdirSync(path.dirname(databasePath), { recursive: true })

export const database = new Database(databasePath)
database.pragma('journal_mode = WAL')
database.pragma('foreign_keys = ON')

database.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 6)
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    student_number INTEGER NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS question_sets (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 6),
    subject TEXT NOT NULL,
    material TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    question_set_id TEXT NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    answer INTEGER NOT NULL CHECK (answer IN (0, 1)),
    explanation TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teacher_sessions (
    token_hash TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS administrators (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS administrator_sessions (
    token_hash TEXT PRIMARY KEY,
    administrator_id TEXT NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS application_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
  CREATE INDEX IF NOT EXISTS idx_question_sets_teacher_grade ON question_sets(teacher_id, grade);
  CREATE INDEX IF NOT EXISTS idx_questions_question_set ON questions(question_set_id, position);
  CREATE INDEX IF NOT EXISTS idx_teacher_sessions_expiry ON teacher_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_administrator_sessions_expiry ON administrator_sessions(expires_at);
`)

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex')
}

function insertQuestionSet(questionSet) {
  database.prepare(`
    INSERT INTO question_sets (id, teacher_id, title, grade, subject, material, created_at)
    VALUES (@id, @teacherId, @title, @grade, @subject, @material, @createdAt)
  `).run(questionSet)

  const insertQuestion = database.prepare(`
    INSERT INTO questions (id, question_set_id, statement, answer, explanation, position)
    VALUES (@id, @questionSetId, @statement, @answer, @explanation, @position)
  `)

  questionSet.questions.forEach((question, index) => {
    insertQuestion.run({
      id: question.id,
      questionSetId: questionSet.id,
      statement: question.statement,
      answer: Number(question.answer),
      explanation: question.explanation,
      position: index,
    })
  })
}

if (database.prepare('SELECT COUNT(*) AS total FROM teachers').get().total === 0) {
  const seedDatabase = database.transaction(() => {
    const insertTeacher = database.prepare(`
      INSERT INTO teachers (id, name, title, email, password_salt, password_hash)
      VALUES (@id, @name, @title, @email, @salt, @passwordHash)
    `)
    for (const teacher of teachers) {
      const salt = randomBytes(16).toString('hex')
      insertTeacher.run({
        ...teacher,
        salt,
        passwordHash: hashPassword(teacher.password, salt),
      })
    }

    const insertClass = database.prepare(`
      INSERT INTO classes (id, teacher_id, name, grade)
      VALUES (@id, @teacherId, @name, @grade)
    `)
    const insertStudent = database.prepare(`
      INSERT INTO students (id, class_id, name, student_number, color)
      VALUES (@id, @classId, @name, @number, @color)
    `)
    for (const classroom of seedClasses) {
      insertClass.run(classroom)
      for (const student of classroom.students) {
        insertStudent.run({ ...student, classId: classroom.id })
      }
    }

    for (const questionSet of seedQuestionSets) {
      insertQuestionSet(questionSet)
    }
  })
  seedDatabase()
}

if (database.prepare('SELECT COUNT(*) AS total FROM administrators').get().total === 0) {
  const insertAdministrator = database.prepare(`
    INSERT INTO administrators (id, name, title, email, password_salt, password_hash)
    VALUES (@id, @name, @title, @email, @salt, @passwordHash)
  `)
  for (const administrator of administrators) {
    const salt = randomBytes(16).toString('hex')
    insertAdministrator.run({
      ...administrator,
      salt,
      passwordHash: hashPassword(administrator.password, salt),
    })
  }
}

database.prepare(`
  INSERT OR IGNORE INTO application_settings (key, value)
  VALUES ('school_name', 'SDN Tomang 03')
`).run()

export function authenticateTeacher(email, password) {
  const teacher = database.prepare(`
    SELECT id, name, title, email, password_salt AS passwordSalt, password_hash AS passwordHash
    FROM teachers
    WHERE email = ?
  `).get(email.trim())

  if (!teacher || typeof password !== 'string') return null
  const candidate = Buffer.from(hashPassword(password, teacher.passwordSalt), 'hex')
  const expected = Buffer.from(teacher.passwordHash, 'hex')
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null

  return { id: teacher.id, name: teacher.name, title: teacher.title, email: teacher.email }
}

export function authenticateAdministrator(email, password) {
  const administrator = database.prepare(`
    SELECT id, name, title, email, password_salt AS passwordSalt, password_hash AS passwordHash
    FROM administrators
    WHERE email = ?
  `).get(email.trim())

  if (!administrator || typeof password !== 'string') return null
  const candidate = Buffer.from(hashPassword(password, administrator.passwordSalt), 'hex')
  const expected = Buffer.from(administrator.passwordHash, 'hex')
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null

  return { id: administrator.id, name: administrator.name, title: administrator.title, email: administrator.email }
}

export function createTeacherSession(teacherId) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000
  database.prepare('DELETE FROM teacher_sessions WHERE expires_at <= ?').run(Date.now())
  database.prepare(`
    INSERT INTO teacher_sessions (token_hash, teacher_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, teacherId, expiresAt)
  return { token, expiresAt }
}

export function createAdministratorSession(administratorId) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000
  database.prepare('DELETE FROM administrator_sessions WHERE expires_at <= ?').run(Date.now())
  database.prepare(`
    INSERT INTO administrator_sessions (token_hash, administrator_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, administratorId, expiresAt)
  return { token, expiresAt }
}

export function getSessionTeacher(token) {
  if (typeof token !== 'string' || token.length > 100) return null
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return database.prepare(`
    SELECT teachers.id, teachers.name, teachers.title, teachers.email
    FROM teacher_sessions
    JOIN teachers ON teachers.id = teacher_sessions.teacher_id
    WHERE teacher_sessions.token_hash = ? AND teacher_sessions.expires_at > ?
  `).get(tokenHash, Date.now()) ?? null
}

export function getSessionAdministrator(token) {
  if (typeof token !== 'string' || token.length > 100) return null
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return database.prepare(`
    SELECT administrators.id, administrators.name, administrators.title, administrators.email
    FROM administrator_sessions
    JOIN administrators ON administrators.id = administrator_sessions.administrator_id
    WHERE administrator_sessions.token_hash = ? AND administrator_sessions.expires_at > ?
  `).get(tokenHash, Date.now()) ?? null
}

export function revokeTeacherSession(token) {
  if (typeof token !== 'string' || token.length > 100) return
  const tokenHash = createHash('sha256').update(token).digest('hex')
  database.prepare('DELETE FROM teacher_sessions WHERE token_hash = ?').run(tokenHash)
}

export function revokeAdministratorSession(token) {
  if (typeof token !== 'string' || token.length > 100) return
  const tokenHash = createHash('sha256').update(token).digest('hex')
  database.prepare('DELETE FROM administrator_sessions WHERE token_hash = ?').run(tokenHash)
}

export function getTeacherClasses(teacherId) {
  const classes = database.prepare(`
    SELECT id, name, grade, teacher_id AS teacherId
    FROM classes
    WHERE teacher_id = ?
    ORDER BY grade DESC, name
  `).all(teacherId)
  const students = database.prepare(`
    SELECT id, name, student_number AS number, color
    FROM students
    WHERE class_id = ?
    ORDER BY student_number, name
  `)

  return classes.map((classroom) => ({
    ...classroom,
    students: students.all(classroom.id),
  }))
}

export function teacherOwnsClass(classId, teacherId) {
  return Boolean(database.prepare(`
    SELECT 1
    FROM classes
    WHERE id = ? AND teacher_id = ?
  `).get(classId, teacherId))
}

export function hasTeacherClassName(teacherId, name, exceptClassId = '') {
  return Boolean(database.prepare(`
    SELECT 1
    FROM classes
    WHERE teacher_id = ? AND name = ? COLLATE NOCASE AND id != ?
  `).get(teacherId, name, exceptClassId))
}

export function createTeacherClass(classroom) {
  database.prepare(`
    INSERT INTO classes (id, teacher_id, name, grade)
    VALUES (@id, @teacherId, @name, @grade)
  `).run(classroom)
}

export function updateTeacherClass(classId, teacherId, classroom) {
  return database.prepare(`
    UPDATE classes
    SET name = @name, grade = @grade
    WHERE id = @id AND teacher_id = @teacherId
  `).run({ ...classroom, id: classId, teacherId }).changes > 0
}

export function deleteTeacherClass(classId, teacherId) {
  return database.prepare(`
    DELETE FROM classes
    WHERE id = ? AND teacher_id = ?
  `).run(classId, teacherId).changes > 0
}

export function createTeacherStudent(student, teacherId) {
  const classroom = database.prepare(`
    SELECT classes.id
    FROM classes
    WHERE classes.id = ? AND classes.teacher_id = ?
  `).get(student.classId, teacherId)
  if (!classroom) return false

  const nextNumber = database.prepare(`
    SELECT COALESCE(MAX(student_number), 0) + 1 AS number
    FROM students
    WHERE class_id = ?
  `).get(student.classId).number
  const colors = ['#d9e8ca', '#f0d8c8', '#d8e1ef', '#ead8eb', '#f0e4b9', '#cde5df']
  database.prepare(`
    INSERT INTO students (id, class_id, name, student_number, color)
    VALUES (@id, @classId, @name, @number, @color)
  `).run({ ...student, number: nextNumber, color: colors[(nextNumber - 1) % colors.length] })
  return true
}

export function updateTeacherStudent(studentId, teacherId, student) {
  return database.prepare(`
    UPDATE students
    SET class_id = @classId,
        name = @name,
        student_number = (
          SELECT COALESCE(MAX(other.student_number), 0) + 1
          FROM students AS other
          WHERE other.class_id = @classId AND other.id != @id
        )
    WHERE id = @id
      AND EXISTS (
        SELECT 1
        FROM classes AS current_class
        WHERE current_class.id = students.class_id AND current_class.teacher_id = @teacherId
      )
      AND EXISTS (
        SELECT 1
        FROM classes AS target_class
        WHERE target_class.id = @classId AND target_class.teacher_id = @teacherId
      )
  `).run({ ...student, id: studentId, teacherId }).changes > 0
}

export function deleteTeacherStudent(studentId, teacherId) {
  return database.prepare(`
    DELETE FROM students
    WHERE id = ?
      AND EXISTS (
        SELECT 1
        FROM classes
        WHERE classes.id = students.class_id AND classes.teacher_id = ?
      )
  `).run(studentId, teacherId).changes > 0
}

export function importTeacherStudents(studentsToImport, teacherId) {
  const colors = ['#d9e8ca', '#f0d8c8', '#d8e1ef', '#ead8eb', '#f0e4b9', '#cde5df']
  const insertStudent = database.prepare(`
    INSERT INTO students (id, class_id, name, student_number, color)
    VALUES (?, ?, ?, ?, ?)
  `)
  const nextNumber = database.prepare(`
    SELECT COALESCE(MAX(student_number), 0) + 1 AS number
    FROM students
    WHERE class_id = ?
  `)
  const classExists = database.prepare(`
    SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?
  `)
  const existingName = database.prepare(`
    SELECT 1 FROM students WHERE class_id = ? AND name = ? COLLATE NOCASE
  `)

  return database.transaction(() => {
    let added = 0
    let skipped = 0
    const knownNames = new Set()

    for (const student of studentsToImport) {
      if (!classExists.get(student.classId, teacherId)) {
        throw new Error('Kelas impor tidak ditemukan pada akun guru ini.')
      }
      const key = `${student.classId}:${student.name.toLocaleLowerCase('id-ID')}`
      if (knownNames.has(key) || existingName.get(student.classId, student.name)) {
        skipped += 1
        continue
      }
      knownNames.add(key)
      const number = nextNumber.get(student.classId).number
      insertStudent.run(
        `murid-${randomBytes(16).toString('hex')}`,
        student.classId,
        student.name,
        number,
        colors[(number - 1) % colors.length],
      )
      added += 1
    }

    return { added, skipped }
  })()
}

export function getAdminOverview() {
  const teachersOverview = database.prepare(`
    SELECT teachers.id, teachers.name, teachers.title, teachers.email,
      COUNT(DISTINCT classes.id) AS classCount,
      COUNT(DISTINCT students.id) AS studentCount
    FROM teachers
    LEFT JOIN classes ON classes.teacher_id = teachers.id
    LEFT JOIN students ON students.class_id = classes.id
    GROUP BY teachers.id
    ORDER BY teachers.name COLLATE NOCASE
  `).all()
  const students = database.prepare(`
    SELECT students.id, students.name, classes.name AS className,
      classes.grade, classes.id AS classId, teachers.name AS teacherName
    FROM students
    JOIN classes ON classes.id = students.class_id
    JOIN teachers ON teachers.id = classes.teacher_id
    ORDER BY teachers.name COLLATE NOCASE, classes.grade DESC, classes.name, students.student_number
  `).all()
  const schoolName = database.prepare(`
    SELECT value FROM application_settings WHERE key = 'school_name'
  `).get()?.value ?? 'SDN Tomang 03'

  return { schoolName, teachers: teachersOverview, students }
}

export function updateSchoolName(name) {
  database.prepare(`
    INSERT INTO application_settings (key, value)
    VALUES ('school_name', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(name)
}

export function deleteAdministratorTeacher(teacherId) {
  return database.prepare('DELETE FROM teachers WHERE id = ?').run(teacherId).changes > 0
}

export function deleteAdministratorStudent(studentId) {
  return database.prepare('DELETE FROM students WHERE id = ?').run(studentId).changes > 0
}

export function getTeacherQuestionSets(teacherId) {
  const questionSets = database.prepare(`
    SELECT id, teacher_id AS teacherId, title, grade, subject, material, created_at AS createdAt
    FROM question_sets
    WHERE teacher_id = ?
    ORDER BY created_at DESC
  `).all(teacherId)
  const questions = database.prepare(`
    SELECT id, statement, answer, explanation
    FROM questions
    WHERE question_set_id = ?
    ORDER BY position
  `)

  return questionSets.map((questionSet) => ({
    ...questionSet,
    questions: questions.all(questionSet.id).map((question) => ({
      ...question,
      answer: Boolean(question.answer),
    })),
  }))
}

export function createQuestionSet(questionSet) {
  const persist = database.transaction(() => insertQuestionSet(questionSet))
  persist()
}

export function deleteQuestionSet(questionSetId, teacherId) {
  return database.prepare(`
    DELETE FROM question_sets
    WHERE id = ? AND teacher_id = ?
  `).run(questionSetId, teacherId).changes > 0
}

export { databasePath }
