import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Plus,
  Pencil,
  Sparkles,
  Trash2,
  UsersRound,
  Video,
  X,
} from 'lucide-react'
import FullscreenGame from './FullscreenGame.jsx'
import TreasureHuntGame from './TreasureHuntGame.jsx'
import ClashOfClanGame from './ClashOfClanGame.jsx'
import './App.css'

const navItems = [
  { id: 'overview', label: 'Beranda', icon: LayoutDashboard },
  { id: 'questions', label: 'Bank soal', icon: BookOpen },
  { id: 'students', label: 'Data siswa', icon: UsersRound },
]

function App() {
  const [classes, setClasses] = useState([])
  const [questionSets, setQuestionSets] = useState([])
  const [teacher, setTeacher] = useState(null)
  const [classId, setClassId] = useState('')
  const [page, setPage] = useState('overview')
  const [loginEmail, setLoginEmail] = useState('nafi@ruangmain.id')
  const [loginPassword, setLoginPassword] = useState('belajar123')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [schoolName, setSchoolName] = useState('SDN Tomang 03')

  const teacherClasses = useMemo(
    () => classes.filter((item) => item.teacherId === teacher?.id),
    [classes, teacher],
  )
  const selectedClass = teacherClasses.find((item) => item.id === classId) ?? teacherClasses[0]

  async function handleLogin(event) {
    event.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Email atau kata sandi tidak cocok.')
      const user = result.user ?? (result.teacher ? { ...result.teacher, role: 'teacher' } : null)
      if (!user) {
        throw new Error('Respons login dari server tidak dikenali. Hentikan dan jalankan ulang server aplikasi agar API terbaru aktif.')
      }
      if (user.role !== 'admin' && user.role !== 'teacher') {
        throw new Error('Server tidak mengirim jenis akun yang valid. Hentikan dan jalankan ulang server aplikasi agar API terbaru aktif.')
      }
      if (user.role === 'admin') {
        setTeacher(user)
      } else {
        const requests = [
          fetch('/api/classes'),
          fetch('/api/question-sets'),
        ]
        if (result.user) requests.push(fetch('/api/settings'))
        const [classesResponse, setsResponse, settingsResponse] = await Promise.all(requests)
        const classesResult = await classesResponse.json()
        const setsResult = await setsResponse.json()
        const settingsResult = settingsResponse ? await settingsResponse.json() : { schoolName: 'SDN Tomang 03' }
        if (!classesResponse.ok || !setsResponse.ok || (settingsResponse && !settingsResponse.ok)) {
          throw new Error(classesResult.error || setsResult.error || settingsResult.error || 'Data kelas belum berhasil dimuat.')
        }
        setClasses(classesResult.classes)
        setQuestionSets(setsResult.questionSets)
        setSchoolName(settingsResult.schoolName)
        setClassId(classesResult.classes[0]?.id ?? '')
        setTeacher(user)
      }
      setPage('overview')
    } catch (error) {
      setLoginError(error.message || 'Server belum dapat dihubungi. Pastikan aplikasi dan database SQLite sedang berjalan.')
    } finally {
      setLoginLoading(false)
    }
  }

  function handleLogout() {
    fetch('/api/session', { method: 'DELETE' }).catch((error) => {
      console.error('Could not revoke the teacher session:', error)
    })
    setTeacher(null)
    setClassId('')
    setClasses([])
    setQuestionSets([])
    setSchoolName('SDN Tomang 03')
    setPage('overview')
  }

  async function handleImportStudents(students) {
    const response = await fetch('/api/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Daftar murid belum dapat diimpor.')
    setClasses(result.classes)
    return { added: result.added, skipped: result.skipped }
  }

  async function handleCreateQuestionSet(questionSet) {
    const response = await fetch('/api/question-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(questionSet),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Paket soal belum dapat disimpan ke SQLite.')
    setQuestionSets((current) => [result.questionSet, ...current])
    return result.questionSet
  }

  async function handleDeleteQuestionSet(id) {
    const response = await fetch(`/api/question-sets/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Paket soal belum dapat dihapus dari SQLite.')
    }
    setQuestionSets((current) => current.filter((item) => item.id !== id))
  }

  async function saveManagedData(path, method, payload) {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Perubahan data belum dapat disimpan.')
    setClasses(result.classes)
    setClassId((current) => result.classes.some((item) => item.id === current) ? current : result.classes[0]?.id ?? '')
  }

  function handleSaveClass(classroom) {
    const method = classroom.id ? 'PATCH' : 'POST'
    const path = classroom.id ? `/api/classes/${encodeURIComponent(classroom.id)}` : '/api/classes'
    return saveManagedData(path, method, { name: classroom.name, grade: Number(classroom.grade) })
  }

  async function handleDeleteClass(classIdToDelete) {
    const response = await fetch(`/api/classes/${encodeURIComponent(classIdToDelete)}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Kelas belum dapat dihapus.')
    setClasses(result.classes)
    setClassId((current) => result.classes.some((item) => item.id === current) ? current : result.classes[0]?.id ?? '')
  }

  function handleSaveStudent(student) {
    const method = student.id ? 'PATCH' : 'POST'
    const path = student.id ? `/api/students/${encodeURIComponent(student.id)}` : '/api/students'
    return saveManagedData(path, method, { name: student.name, classId: student.classId })
  }

  async function handleDeleteStudent(studentId) {
    const response = await fetch(`/api/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Murid belum dapat dihapus.')
    setClasses(result.classes)
  }

  if (!teacher) {
    return (
      <LoginScreen
        email={loginEmail}
        password={loginPassword}
        error={loginError}
        loading={loginLoading}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLogin}
      />
    )
  }

  if (teacher.role === 'admin') {
    return <AdminDashboard administrator={teacher} onLogout={handleLogout} schoolName={schoolName} onSchoolNameChange={setSchoolName} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('overview') }}>
          <span className="brand-mark"><Sparkles size={21} strokeWidth={2.5} /></span>
          <span className="brand-name">ruang<span>main</span><small>MEDIA BELAJAR</small></span>
        </a>
        <div className="side-school"><span className="school-avatar">SD</span><span><strong>{schoolName}</strong><small>Tahun ajaran 2026/2027</small></span><ChevronDown size={15} /></div>
        <div className="nav-label">MENU UTAMA</div>
        <nav className="main-nav" aria-label="Navigasi utama">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <Icon size={18} /><span>{label}</span>
              {id === 'questions' && <span className="nav-count">{questionSets.length}</span>}
            </button>
          ))}
          <button className={`nav-link ${page === 'game' ? 'active' : ''}`} onClick={() => setPage('game')}>
            <span className="nav-game-icon">✳</span><span>Studio permainan</span><span className="live-dot" />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-icon"><Lightbulb size={17} /></span><strong>Siap bermain?</strong><p>Jadikan belajar lebih seru dengan aktivitas bergerak.</p><button onClick={() => setPage('game')}>Mulai permainan <ArrowRight size={14} /></button></div>
          <div className="profile-row"><span className="teacher-avatar">{teacher.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="profile-name"><strong>{teacher.title}</strong><small>Guru kelas</small></span><button className="icon-button logout-button" title="Keluar" onClick={handleLogout}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <div className="content-wrap">
        <header className="topbar">
          <div className="breadcrumb"><span>Ruang guru</span><span className="breadcrumb-slash">/</span><strong>{navItems.find((item) => item.id === page)?.label ?? 'Studio permainan'}</strong></div>
          <div className="topbar-actions">
            <span className="today-label">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span>
            <label className="class-switcher"><span>Kelas</span><select value={selectedClass?.id ?? ''} onChange={(event) => setClassId(event.target.value)} aria-label="Pilih kelas">{teacherClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.grade}</option>)}</select><ChevronDown size={14} /></label>
            <span className="top-avatar">{teacher.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
          </div>
        </header>
        <main className={page === 'game' ? 'page-content game-content' : 'page-content'}>
          {page === 'overview' && selectedClass && <OverviewPage teacher={teacher} classroom={selectedClass} questionSets={questionSets} onNavigate={setPage} />}
          {page === 'questions' && <QuestionBank questionSets={questionSets} onCreate={handleCreateQuestionSet} onDelete={handleDeleteQuestionSet} />}
          {page === 'students' && selectedClass && <StudentsPage classroom={selectedClass} classrooms={teacherClasses} onSelectClass={setClassId} onSaveClass={handleSaveClass} onDeleteClass={handleDeleteClass} onSaveStudent={handleSaveStudent} onDeleteStudent={handleDeleteStudent} onImportStudents={handleImportStudents} />}
          {page === 'game' && selectedClass && <GamePage classroom={selectedClass} questionSets={questionSets} onNavigate={setPage} />}
        </main>
        <footer className="page-footer"><span>© 2026 Ruangmain</span><span>Dibuat untuk kelas yang lebih aktif <span className="footer-heart">♥</span></span></footer>
      </div>
    </div>
  )
}

function AdminDashboard({ administrator, onLogout, schoolName, onSchoolNameChange }) {
  const [overview, setOverview] = useState(null)
  const [name, setName] = useState(schoolName)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const loadOverview = useCallback(async () => {
    const response = await fetch('/api/admin/overview')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Ringkasan admin belum dapat dimuat.')
    setOverview(result)
    setName(result.schoolName)
    onSchoolNameChange(result.schoolName)
  }, [onSchoolNameChange])

  useEffect(() => {
    let cancelled = false
    async function initializeOverview() {
      try {
        const response = await fetch('/api/admin/overview')
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Ringkasan admin belum dapat dimuat.')
        if (cancelled) return
        setOverview(result)
        setName(result.schoolName)
        onSchoolNameChange(result.schoolName)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Ringkasan admin belum dapat dimuat.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    initializeOverview()
    return () => { cancelled = true }
  }, [onSchoolNameChange])

  async function saveSchool(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/school', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Nama sekolah belum dapat disimpan.')
      onSchoolNameChange(result.schoolName)
      setName(result.schoolName)
      setNotice('Nama sekolah berhasil diperbarui.')
      await loadOverview()
    } catch (saveError) {
      setError(saveError.message || 'Nama sekolah belum dapat disimpan.')
    }
  }

  async function deleteRecord(kind, item) {
    const label = kind === 'teachers' ? `akun guru ${item.name} beserta kelas dan muridnya` : `murid ${item.name}`
    if (!window.confirm(`Hapus ${label}? Tindakan ini tidak dapat dibatalkan.`)) return
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/admin/${kind}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Data belum dapat dihapus.')
      setOverview(result)
      setName(result.schoolName)
      onSchoolNameChange(result.schoolName)
      setNotice(kind === 'teachers' ? 'Akun guru berhasil dihapus.' : 'Data murid berhasil dihapus.')
    } catch (deleteError) {
      setError(deleteError.message || 'Data belum dapat dihapus.')
    }
  }

  return (
    <div className="admin-shell">
      <header className="admin-header"><a className="brand" href="#"><span className="brand-mark"><Sparkles size={21} /></span><span className="brand-name">ruang<span>main</span><small>ADMINISTRATOR</small></span></a><div><strong>{administrator.name}</strong><span>Administrator</span><button className="button button-outline" onClick={onLogout}><LogOut size={15} /> Keluar</button></div></header>
      <main className="admin-content">
        <span className="eyebrow">PENGELOLAAN SEKOLAH</span><h1>Dashboard admin</h1><p>Kelola identitas sekolah, akun guru, dan data seluruh murid.</p>
        {error && <div className="notice notice-error"><CircleHelp size={17} /><span>{error}</span></div>}
        {notice && <div className="notice notice-success">{notice}</div>}
        {loading && !overview ? <div className="admin-panel">Memuat data sekolah...</div> : overview && <>
          <form className="admin-panel school-settings" onSubmit={saveSchool}><div><span className="eyebrow">IDENTITAS</span><h2>Nama sekolah</h2></div><label><span className="sr-only">Nama sekolah</span><input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><button className="button button-primary" type="submit">Simpan nama sekolah</button></form>
          <div className="admin-stats"><article><strong>{overview.teachers.length}</strong><span>Guru</span></article><article><strong>{overview.students.length}</strong><span>Murid</span></article></div>
          <section className="admin-panel"><div className="student-list-heading"><div><strong>Data guru</strong><span>Penghapusan guru juga menghapus kelas, murid, dan paket soalnya.</span></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Nama</th><th>Email</th><th>Kelas</th><th>Murid</th><th>Aksi</th></tr></thead><tbody>{overview.teachers.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.email}</td><td>{item.classCount}</td><td>{item.studentCount}</td><td><button className="icon-button danger-icon-button" aria-label={`Hapus guru ${item.name}`} title="Hapus guru" disabled={overview.teachers.length <= 1} onClick={() => deleteRecord('teachers', item)}><Trash2 size={15} /></button></td></tr>)}</tbody></table>{overview.teachers.length === 0 && <p className="admin-empty">Belum ada guru terdaftar.</p>}</div></section>
          <section className="admin-panel"><div className="student-list-heading"><div><strong>Seluruh murid</strong><span>Data murid dari semua kelas dan guru.</span></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Nama murid</th><th>Kelas</th><th>Tingkat</th><th>Guru</th><th>Aksi</th></tr></thead><tbody>{overview.students.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.className}</td><td>{item.grade}</td><td>{item.teacherName}</td><td><button className="icon-button danger-icon-button" aria-label={`Hapus murid ${item.name}`} title="Hapus murid" onClick={() => deleteRecord('students', item)}><Trash2 size={15} /></button></td></tr>)}</tbody></table>{overview.students.length === 0 && <p className="admin-empty">Belum ada murid terdaftar.</p>}</div></section>
        </>}
      </main>
    </div>
  )
}

function LoginScreen({ email, password, error, loading, onEmailChange, onPasswordChange, onSubmit }) {
  return (
    <main className="login-layout">
      <section className="login-visual">
        <a className="brand login-brand" href="#"><span className="brand-mark"><Sparkles size={21} strokeWidth={2.5} /></span><span className="brand-name">ruang<span>main</span><small>MEDIA BELAJAR</small></span></a>
        <div className="login-message"><span className="eyebrow light-eyebrow"><span /> BELAJAR JADI BERGERAK</span><h1>Ruang kelas,<br />penuh <span>kejutan.</span></h1><p>Tempat ide bertemu gerak. Bikin momen belajar yang susah dilupakan.</p><div className="visual-doodle"><div className="doodle-sun">✳</div><div className="doodle-card"><span>HARI INI</span><strong>Belajar sambil<br />melompat?</strong><div className="doodle-pill">Boleh banget! <span>↗</span></div></div><span className="doodle-star">✳</span><span className="doodle-squiggle">〰</span></div></div>
        <div className="visual-footer"><span>01 — AKTIF</span><span>02 — INTERAKTIF</span><span>03 — BERMAKNA</span></div>
      </section>
      <section className="login-panel"><div className="login-form-wrap"><span className="eyebrow">SELAMAT DATANG KEMBALI</span><h2>Masuk ke ruang guru</h2><p className="login-intro">Atur aktivitas, siapkan permainan, dan lihat kelasmu bertumbuh.</p>
        <form className="login-form" onSubmit={onSubmit}><label>Email akun<input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="username" required /></label><label>Kata sandi<input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} autoComplete="current-password" required /></label>{error && <div className="form-error"><CircleHelp size={16} />{error}</div>}<button className="button button-primary login-submit" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={16} className="spin" /> Memuat data...</> : <>Masuk ke dashboard <ArrowRight size={17} /></>}</button></form>
        <div className="login-demo"><span className="demo-sparkle"><Sparkles size={16} /></span><span><strong>Akun demo guru</strong><small>nafi@ruangmain.id · belajar123</small></span><button type="button" onClick={() => { onEmailChange('nafi@ruangmain.id'); onPasswordChange('belajar123') }}>Isi otomatis</button></div>
        <p className="login-footnote">Belum punya akun? <a href="mailto:halo@ruangmain.id">Hubungi administrator sekolah</a></p></div><div className="login-side-note"><span className="side-note-line" />Aktivitas belajar yang bikin semua ikut bergerak</div></section>
    </main>
  )
}

function OverviewPage({ teacher, classroom, questionSets, onNavigate }) {
  const count = classroom.students.length
  const kitsForClass = questionSets.filter((set) => Number(set.grade) === Number(classroom.grade))
  return (
    <div className="overview-page">
      <section className="welcome-row"><div><span className="eyebrow">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toLocaleUpperCase('id-ID')} <span className="eyebrow-divider">·</span> SEMESTER GANJIL</span><h1>Halo, {teacher.title} <span className="wave">✳</span></h1><p>Siap bikin belajar hari ini lebih seru?</p></div><button className="button button-outline" onClick={() => onNavigate('students')}><UsersRound size={16} /> Lihat data siswa</button></section>
      <section className="hero-card"><div className="hero-copy"><span className="hero-kicker"><span /> PERMAINAN MINGGU INI</span><h2>Benar atau salah?<br /><span>Langkahmu menentukan.</span></h2><p>Ubah ruang kelas jadi arena belajar. Baca soalnya, pilih sisi, lalu buktikan jawabanmu!</p><button className="button button-light" onClick={() => onNavigate('game')}>Siapkan permainan <ArrowRight size={16} /></button><div className="hero-meta"><span><Clock3 size={14} /> 10–15 menit</span><span><UsersRound size={14} /> Seluruh kelas</span></div></div><div className="hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sun">✳</div><div className="art-check-card"><span>JAWABANMU?</span><div><span className="mini-choice choice-true"><Check size={13} /></span><span className="mini-choice choice-false"><X size={13} /></span></div></div><span className="art-sparkle sparkle-a">✳</span><span className="art-sparkle sparkle-b">✦</span><div className="art-score">+10 <span>poin</span></div></div><div className="hero-index">01</div></section>
      <div className="section-heading"><div><span className="eyebrow">RINGKASAN KELAS</span><h2>Gambaran kelas {classroom.name}</h2></div><span className="class-grade-tag">KELAS {classroom.grade}</span></div>
      <section className="stat-grid"><StatCard icon={<UsersRound size={18} />} label="Siswa terdaftar" value={count} note="Semua siswa aktif" color="lavender" /><StatCard icon={<BookOpen size={18} />} label="Paket soal" value={kitsForClass.length} note="Sesuai tingkat kelas" color="peach" /><StatCard icon={<Activity size={18} />} label="Aktivitas belajar" value="3" note="Minggu ini" color="mint" /><StatCard icon={<GraduationCap size={19} />} label="Partisipasi" value="92%" note="Rata-rata kelas" color="yellow" /></section>
      <section className="lower-grid"><div className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">MATERI SIAP PAKAI</span><h3>Paket soal terbaru</h3></div><button className="text-link" onClick={() => onNavigate('questions')}>Lihat semua <ArrowRight size={14} /></button></div>{kitsForClass.slice(0, 3).map((set, index) => <div className="recent-item" key={set.id}><span className={`subject-mark subject-${index % 3}`}>{set.subject.slice(0, 1)}</span><span className="recent-title"><strong>{set.title}</strong><small>{set.subject} <span>·</span> {set.questions.length} soal</small></span><span className="recent-time">{index === 0 ? 'Baru saja' : `${index + 1} hari lalu`}</span><ArrowUpRight size={15} className="recent-arrow" /></div>)}{kitsForClass.length === 0 && <div className="empty-inline"><span>✳</span><p>Belum ada paket untuk kelas ini. Buat soal pertamamu dengan AI.</p></div>}<button className="add-kit-link" onClick={() => onNavigate('questions')}><Plus size={15} /> Buat paket soal baru</button></div><div className="panel quick-panel"><div className="quick-heading"><span className="quick-icon"><Video size={17} /></span><span className="eyebrow">AKTIVITAS CEPAT</span></div><h3>Kelas {classroom.name}<br />siap bergerak?</h3><p>Permainan benar/salah menggunakan kamera kelas untuk membuat siswa lebih aktif.</p><div className="quick-features"><span><CheckCircle2 size={14} /> Kamera kelas</span><span><CheckCircle2 size={14} /> Atur waktu</span></div><button className="button button-dark" onClick={() => onNavigate('game')}>Buka studio <ArrowRight size={15} /></button><span className="quick-decoration">↗</span></div></section>
      <section className="student-strip"><div className="student-strip-copy"><span className="eyebrow">KENALI KELASMU</span><strong>{count} wajah penuh rasa ingin tahu</strong><small>Data siswa kelas {classroom.name} siap untuk aktivitas hari ini.</small></div><div className="avatar-stack">{classroom.students.slice(0, 5).map((student) => <span className="student-avatar" key={student.id} style={{ backgroundColor: student.color }}>{student.name.split(' ').map((part) => part[0]).join('').slice(0, 1)}</span>)}{count > 5 && <span className="avatar-more">+{count - 5}</span>}</div><button className="icon-button strip-arrow" aria-label="Lihat siswa" onClick={() => onNavigate('students')}><ArrowRight size={17} /></button></section>
    </div>
  )
}

function StatCard({ icon, label, value, note, color }) {
  return <div className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note"><span />{note}</span></div>
}

function QuestionBank({ questionSets, onCreate, onDelete }) {
  const [isCreating, setIsCreating] = useState(false)
  const [creationMode, setCreationMode] = useState('ai')
  const [status, setStatus] = useState({ loading: false, error: '', message: '' })
  const [form, setForm] = useState({ grade: '5', subject: 'IPAS', material: '', count: '5' })
  const [manualQuestions, setManualQuestions] = useState([{ statement: '', answer: true, explanation: '' }])
  const [showGenerated, setShowGenerated] = useState(null)

  async function generateQuestions(event) {
    event.preventDefault()
    setStatus({ loading: true, error: '', message: '' })
    try {
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: Number(form.grade), subject: form.subject, material: form.material.trim(), count: Number(form.count) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Soal belum berhasil dibuat. Silakan coba lagi.')
      const newSet = {
        title: form.material.trim(),
        grade: Number(form.grade),
        subject: form.subject,
        material: form.material.trim(),
        questions: result.questions,
      }
      const savedSet = await onCreate(newSet)
      setShowGenerated(savedSet)
      setStatus({ loading: false, error: '', message: `${newSet.questions.length} soal berhasil dibuat dan disimpan.` })
      setForm((current) => ({ ...current, material: '' }))
      setIsCreating(false)
    } catch (error) {
      setStatus({ loading: false, error: error.message || 'Terjadi kesalahan saat menghubungi layanan AI.', message: '' })
    }
  }

  async function saveManualQuestions(event) {
    event.preventDefault()
    setStatus({ loading: true, error: '', message: '' })
    try {
      const newSet = {
        title: form.material.trim(),
        grade: Number(form.grade),
        subject: form.subject,
        material: form.material.trim(),
        questions: manualQuestions.map((question, index) => ({
          id: `manual-${Date.now()}-${index}`,
          statement: question.statement.trim(),
          answer: question.answer,
          explanation: question.explanation.trim() || (question.answer ? 'Pernyataan tersebut sesuai dengan materi.' : 'Pernyataan tersebut tidak sesuai dengan materi.'),
        })),
      }
      const savedSet = await onCreate(newSet)
      setShowGenerated(savedSet)
      setStatus({ loading: false, error: '', message: `${newSet.questions.length} soal berhasil disimpan.` })
      setForm((current) => ({ ...current, material: '' }))
      setManualQuestions([{ statement: '', answer: true, explanation: '' }])
      setIsCreating(false)
    } catch (error) {
      setStatus({ loading: false, error: error.message || 'Paket soal belum berhasil disimpan.', message: '' })
    }
  }

  async function removeQuestionSet(id) {
    try {
      await onDelete(id)
    } catch (error) {
      setStatus({ loading: false, error: error.message || 'Paket soal belum dapat dihapus.', message: '' })
    }
  }

  return (
    <div className="page-section">
      <section className="page-title-row"><div><span className="eyebrow">PERPUSTAKAAN MATERI</span><h1>Bank soal <span className="title-sparkle">✳</span></h1><p>Kumpulan pertanyaan benar/salah untuk aktivitas kelas.</p></div><button className="button button-primary" onClick={() => { setIsCreating((current) => !current); setStatus({ loading: false, error: '', message: '' }) }}><Plus size={17} /> Buat paket soal</button></section>
      {status.error && <div className="notice notice-error"><CircleHelp size={17} /><div><strong>Soal belum berhasil dibuat</strong><p>{status.error}</p></div><button className="icon-button" onClick={() => setStatus((current) => ({ ...current, error: '' }))} aria-label="Tutup"><X size={16} /></button></div>}
      {status.message && <div className="notice notice-success"><CheckCircle2 size={17} /><span>{status.message}</span><button className="icon-button" onClick={() => setStatus((current) => ({ ...current, message: '' }))} aria-label="Tutup"><X size={16} /></button></div>}
      {isCreating && <section className="create-panel">
        <div className="create-panel-heading"><span className="ai-icon">{creationMode === 'ai' ? <Sparkles size={17} /> : <BookOpen size={17} />}</span><div><span className="eyebrow">{creationMode === 'ai' ? 'ASISTEN AI DEEPSEEK' : 'BUAT SOAL MANUAL'}</span><h3>{creationMode === 'ai' ? 'Soal yang pas untuk kelasmu' : 'Tulis paket soal sendiri'}</h3></div><button type="button" className="icon-button" onClick={() => setIsCreating(false)} aria-label="Tutup"><X size={18} /></button></div>
        <div className="question-creation-tabs" role="tablist" aria-label="Cara membuat soal">
          <button type="button" role="tab" aria-selected={creationMode === 'ai'} className={creationMode === 'ai' ? 'selected' : ''} onClick={() => setCreationMode('ai')}><Sparkles size={14} /> Dengan AI</button>
          <button type="button" role="tab" aria-selected={creationMode === 'manual'} className={creationMode === 'manual' ? 'selected' : ''} onClick={() => setCreationMode('manual')}><BookOpen size={14} /> Tulis sendiri</button>
        </div>
        {creationMode === 'ai' ? (
          <form onSubmit={generateQuestions}>
            <p className="create-helper">Ceritakan materi yang sedang dipelajari. AI akan membuat soal benar/salah lengkap dengan penjelasan jawabannya.</p>
            <div className="create-fields">
              <label>Tingkat kelas<select required value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })}>{[1, 2, 3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>Kelas {grade}</option>)}</select></label>
              <label>Mata pelajaran<select required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}>{['IPAS', 'Matematika', 'Bahasa Indonesia', 'Pendidikan Pancasila', 'Bahasa Inggris', 'Seni Budaya'].map((subject) => <option key={subject}>{subject}</option>)}</select></label>
              <label className="material-field">Materi<textarea required minLength={3} maxLength={180} rows={2} placeholder="Contoh: Perubahan wujud benda, mencair dan membeku" value={form.material} onChange={(event) => setForm({ ...form, material: event.target.value })} /></label>
              <label>Jumlah soal<select value={form.count} onChange={(event) => setForm({ ...form, count: event.target.value })}><option value="3">3 soal</option><option value="5">5 soal</option><option value="8">8 soal</option><option value="10">10 soal</option></select></label>
            </div>
            <div className="create-footer"><span><Lightbulb size={14} /> Soal AI disimpan di SQLite dan siap dipakai.</span><button className="button button-primary" type="submit" disabled={status.loading || !form.material.trim()}>{status.loading ? <><LoaderCircle size={16} className="spin" /> Sedang menyusun soal...</> : <><Sparkles size={16} /> Buat {form.count} soal</>}</button></div>
          </form>
        ) : (
          <form onSubmit={saveManualQuestions}>
            <p className="create-helper">Tentukan kelas dan materi, lalu tulis pernyataan benar/salah beserta jawabannya. Penjelasan bersifat opsional.</p>
            <div className="create-fields">
              <label>Tingkat kelas<select required value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })}>{[1, 2, 3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>Kelas {grade}</option>)}</select></label>
              <label>Mata pelajaran<select required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}>{['IPAS', 'Matematika', 'Bahasa Indonesia', 'Pendidikan Pancasila', 'Bahasa Inggris', 'Seni Budaya'].map((subject) => <option key={subject}>{subject}</option>)}</select></label>
              <label className="material-field">Materi / judul paket<textarea required minLength={3} maxLength={180} rows={2} placeholder="Contoh: Perubahan wujud benda" value={form.material} onChange={(event) => setForm({ ...form, material: event.target.value })} /></label>
            </div>
            <div className="manual-question-list">
              {manualQuestions.map((question, index) => (
                <fieldset className="manual-question-field" key={index}>
                  <legend>Soal {index + 1}</legend>
                  <label>Pernyataan<textarea required maxLength={500} rows={2} placeholder="Tulis pernyataan yang harus dijawab benar atau salah" value={question.statement} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, statement: event.target.value } : item))} /></label>
                  <div className="manual-answer-options"><span>Jawaban benar:</span><label><input type="radio" name={`answer-${index}`} checked={question.answer} onChange={() => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: true } : item))} /> Benar</label><label><input type="radio" name={`answer-${index}`} checked={!question.answer} onChange={() => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: false } : item))} /> Salah</label></div>
                  <label>Penjelasan (opsional)<textarea maxLength={500} rows={2} placeholder="Tambahkan penjelasan jawaban jika diperlukan" value={question.explanation} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, explanation: event.target.value } : item))} /></label>
                  {manualQuestions.length > 1 && <button className="manual-remove-question" type="button" onClick={() => setManualQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /> Hapus soal</button>}
                </fieldset>
              ))}
            </div>
            <div className="manual-actions"><button className="button button-outline" type="button" disabled={manualQuestions.length >= 10} onClick={() => setManualQuestions((current) => [...current, { statement: '', answer: true, explanation: '' }])}><Plus size={15} /> Tambah soal</button><span>{manualQuestions.length} / 10 soal</span></div>
            <div className="create-footer"><span><Lightbulb size={14} /> Paket manual disimpan ke SQLite.</span><button className="button button-primary" type="submit" disabled={status.loading || !form.material.trim()}>{status.loading ? <><LoaderCircle size={16} className="spin" /> Menyimpan soal...</> : <><Check size={16} /> Simpan {manualQuestions.length} soal</>}</button></div>
          </form>
        )}
      </section>}
      <div className="library-toolbar"><div><strong>{questionSets.length} paket belajar</strong><span>Disimpan di perangkat ini</span></div><span className="library-filter"><BookOpen size={15} /> Semua paket <ChevronDown size={13} /></span></div>
      <div className="question-grid">{questionSets.map((set, index) => <article className="question-card" key={set.id}><div className="question-card-top"><span className={`subject-mark subject-${index % 3}`}>{set.subject.slice(0, 1)}</span><button className="icon-button delete-kit" title="Hapus paket" onClick={() => removeQuestionSet(set.id)}><X size={16} /></button></div><span className="question-grade">KELAS {set.grade} <span>·</span> {set.subject}</span><h3>{set.title}</h3><p>{set.material}</p><div className="question-card-bottom"><span><CircleHelp size={14} /> {set.questions.length} pertanyaan</span><span>{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(set.createdAt))}</span></div><button className="question-preview-link" onClick={() => setShowGenerated(set)}>Lihat isi paket <ArrowRight size={14} /></button></article>)}
        <button className="question-add-card" onClick={() => setIsCreating(true)}><span><Plus size={22} /></span><strong>Materi baru?</strong><small>Buat soal sesuai topik pelajaranmu.</small><span className="add-card-link">Mulai buat soal <ArrowRight size={14} /></span></button>
      </div>
      {showGenerated && <div className="modal-backdrop" role="presentation" onClick={() => setShowGenerated(null)}><div className="question-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}><div className="modal-top"><span className="subject-mark subject-0">{showGenerated.subject.slice(0, 1)}</span><button className="icon-button" onClick={() => setShowGenerated(null)} aria-label="Tutup"><X size={18} /></button></div><span className="eyebrow">KELAS {showGenerated.grade} · {showGenerated.subject}</span><h2 id="modal-title">{showGenerated.title}</h2><div className="modal-questions">{showGenerated.questions.map((question, index) => <div className="modal-question" key={question.id}><span className="modal-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{question.statement}</strong><p><span className={question.answer ? 'answer-true' : 'answer-false'}>{question.answer ? 'BENAR' : 'SALAH'}</span> {question.explanation}</p></div></div>)}</div></div></div>}
    </div>
  )
}

function StudentsPage({ classroom, classrooms, onSelectClass, onSaveClass, onDeleteClass, onSaveStudent, onDeleteStudent, onImportStudents }) {
  const [search, setSearch] = useState('')
  const [editingClass, setEditingClass] = useState(null)
  const [editingStudent, setEditingStudent] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const fileInput = useRef(null)
  const filtered = classroom.students.filter((student) => student.name.toLowerCase().includes(search.toLowerCase()))

  async function importSpreadsheet(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    setImportMessage('')
    setFormError('')
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.worksheets[0]
      if (!sheet || sheet.rowCount < 2) throw new Error('Berkas Excel harus memiliki judul kolom dan setidaknya satu baris murid.')
      const headers = sheet.getRow(1).values.slice(1).map((value) => String(value ?? '').trim().toLocaleLowerCase('id-ID'))
      const nameColumn = headers.findIndex((value) => ['nama', 'nama murid', 'name', 'student name'].includes(value)) + 1
      const classColumn = headers.findIndex((value) => ['kelas', 'class', 'class name'].includes(value)) + 1
      if (!nameColumn) throw new Error('Kolom nama wajib tersedia. Gunakan judul kolom "Nama".')
      const students = []
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const name = String(row.getCell(nameColumn).text ?? '').trim()
        if (!name) return
        const className = classColumn ? String(row.getCell(classColumn).text ?? '').trim() : ''
        const target = className
          ? classrooms.find((item) => item.name.toLocaleLowerCase('id-ID') === className.replace(/^kelas\s+/i, '').toLocaleLowerCase('id-ID'))
          : classroom
        if (!target) throw new Error(`Kelas pada baris ${rowNumber} tidak cocok dengan kelas yang Anda kelola.`)
        students.push({ name, classId: target.id })
      })
      if (!students.length) throw new Error('Tidak ditemukan nama murid yang dapat diimpor.')
      const result = await onImportStudents(students)
      setImportMessage(`${result.added} murid ditambahkan${result.skipped ? `, ${result.skipped} duplikat dilewati` : ''}.`)
    } catch (error) {
      setFormError(error.message || 'Berkas Excel tidak dapat dibaca.')
    } finally {
      setImporting(false)
    }
  }

  async function submitClass(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await onSaveClass(editingClass)
      setEditingClass(null)
    } catch (error) {
      setFormError(error.message || 'Perubahan kelas belum dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  async function submitStudent(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await onSaveStudent(editingStudent)
      setEditingStudent(null)
    } catch (error) {
      setFormError(error.message || 'Perubahan data murid belum dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  async function removeClass(classId) {
    if (!window.confirm('Hapus kelas ini beserta seluruh data murid di dalamnya? Tindakan ini tidak dapat dibatalkan.')) return
    setFormError('')
    try {
      await onDeleteClass(classId)
    } catch (error) {
      setFormError(error.message || 'Kelas belum dapat dihapus.')
    }
  }

  async function removeStudent(student) {
    if (!window.confirm(`Hapus murid "${student.name}" dari data kelas?`)) return
    setFormError('')
    try {
      await onDeleteStudent(student.id)
    } catch (error) {
      setFormError(error.message || 'Murid belum dapat dihapus.')
    }
  }

  return (
    <div className="page-section">
      <section className="page-title-row">
        <div><span className="eyebrow">KELAS DAN PENEMPATAN MURID</span><h1>Kelola kelas <span className="title-sparkle">✳</span></h1><p>Atur kelas yang Anda ajar dan tempatkan murid pada kelasnya.</p></div>
        <button className="button button-primary" onClick={() => { setFormError(''); setEditingClass({ id: '', name: '', grade: String(classroom.grade) }) }}><Plus size={16} /> Tambah kelas</button>
      </section>

      {formError && <div className="notice notice-error"><CircleHelp size={17} /><span>{formError}</span><button className="icon-button" onClick={() => setFormError('')} aria-label="Tutup"><X size={16} /></button></div>}

      <section className="class-management-panel" aria-label="Daftar kelas yang dikelola">
        <div className="student-list-heading"><div><strong>Kelas yang Anda kelola</strong><span>Pilih kelas untuk melihat atau mengatur daftar murid.</span></div><span className="student-total"><UsersRound size={15} /> {classrooms.length} kelas</span></div>
        <div className="managed-class-grid">
          {classrooms.map((item) => (
            <article className={`managed-class-card ${item.id === classroom.id ? 'selected' : ''}`} key={item.id}>
              <button className="managed-class-select" onClick={() => onSelectClass(item.id)} aria-pressed={item.id === classroom.id}>
                <span className="managed-class-icon"><GraduationCap size={18} /></span>
                <span><strong>Kelas {item.name}</strong><small>Tingkat {item.grade} · {item.students.length} murid</small></span>
              </button>
              <div className="managed-class-actions">
                <button type="button" className="icon-button" aria-label={`Ubah kelas ${item.name}`} title="Ubah kelas" onClick={() => { setFormError(''); setEditingClass({ id: item.id, name: item.name, grade: String(item.grade) }) }}><Pencil size={14} /></button>
                <button type="button" className="icon-button danger-icon-button" aria-label={`Hapus kelas ${item.name}`} title="Hapus kelas" onClick={() => removeClass(item.id)} disabled={classrooms.length <= 1}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="student-list-panel managed-students-panel">
        <div className="student-list-heading">
          <div><strong>Murid kelas {classroom.name}</strong><span>Kelola nama dan penempatan kelas murid.</span></div>
          <div className="student-management-actions">
            <label className="search-box"><span className="sr-only">Cari nama murid</span><input type="search" placeholder="Cari nama murid..." value={search} onChange={(event) => setSearch(event.target.value)} /><span>⌕</span></label>
            <input ref={fileInput} className="sr-only" type="file" accept=".xlsx" onChange={importSpreadsheet} />
            <button className="button button-outline" onClick={() => fileInput.current?.click()} disabled={importing}>{importing ? 'Mengimpor...' : 'Impor Excel'}</button>
            <button className="button button-primary" onClick={() => { setFormError(''); setEditingStudent({ id: '', name: '', classId: classroom.id }) }}><Plus size={15} /> Tambah murid</button>
          </div>
        </div>
        {importMessage && <div className="notice notice-success">{importMessage}<button className="icon-button" onClick={() => setImportMessage('')} aria-label="Tutup"><X size={16} /></button></div>}
        <p className="import-hint">Format .xlsx: baris pertama berisi kolom <strong>Nama</strong> dan opsional <strong>Kelas</strong>. Tanpa kolom kelas, murid ditempatkan di kelas yang sedang dipilih. Duplikat pada kelas yang sama dilewati.</p>
        <div className="student-table-wrap">
          <table className="student-table">
            <thead><tr><th>NO.</th><th>NAMA MURID</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>{filtered.map((student, index) => (
              <tr key={student.id}>
                <td><span className="student-number">{String(index + 1).padStart(2, '0')}</span></td>
                <td><span className="table-student"><span className="student-avatar" style={{ backgroundColor: student.color }}>{student.name.split(' ').map((part) => part[0]).join('').slice(0, 1)}</span><strong>{student.name}</strong></span></td>
                <td><span className="status-badge"><span /> Terdaftar</span></td>
                <td><div className="student-row-actions"><button type="button" className="icon-button" aria-label={`Ubah atau pindahkan ${student.name}`} title="Ubah nama atau penempatan kelas" onClick={() => { setFormError(''); setEditingStudent({ id: student.id, name: student.name, classId: classroom.id }) }}><Pencil size={14} /></button><button type="button" className="icon-button danger-icon-button" aria-label={`Hapus ${student.name}`} title="Hapus murid" onClick={() => removeStudent(student)}><Trash2 size={14} /></button></div></td>
              </tr>
            ))}</tbody>
          </table>
          {filtered.length === 0 && <div className="empty-search">{search ? `Tidak ada murid dengan nama “${search}”.` : 'Belum ada murid pada kelas ini. Tambahkan murid untuk mulai mengelola kelas.'}</div>}
        </div>
        <div className="table-footer">Menampilkan {filtered.length} dari {classroom.students.length} murid <span>Penempatan disimpan di SQLite</span></div>
      </section>

      {editingClass && <div className="modal-backdrop" role="presentation" onClick={() => !saving && setEditingClass(null)}><form className="management-modal" role="dialog" aria-modal="true" aria-labelledby="class-editor-title" onSubmit={submitClass} onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">PENGELOLAAN KELAS</span><h2 id="class-editor-title">{editingClass.id ? 'Ubah kelas' : 'Tambah kelas'}</h2></div><button type="button" className="icon-button" onClick={() => setEditingClass(null)} aria-label="Tutup"><X size={18} /></button></div><label>Nama kelas<input required maxLength={40} placeholder="Contoh: 5A" value={editingClass.name} onChange={(event) => setEditingClass((current) => ({ ...current, name: event.target.value }))} /></label><label>Tingkat kelas<select required value={editingClass.grade} onChange={(event) => setEditingClass((current) => ({ ...current, grade: event.target.value }))}>{[1, 2, 3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>Kelas {grade}</option>)}</select></label>{formError && <div className="form-error"><CircleHelp size={15} />{formError}</div>}<div className="management-modal-actions"><button type="button" className="button button-outline" onClick={() => setEditingClass(null)}>Batal</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan kelas'}</button></div></form></div>}

      {editingStudent && <div className="modal-backdrop" role="presentation" onClick={() => !saving && setEditingStudent(null)}><form className="management-modal" role="dialog" aria-modal="true" aria-labelledby="student-editor-title" onSubmit={submitStudent} onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">DATA MURID</span><h2 id="student-editor-title">{editingStudent.id ? 'Ubah atau pindahkan murid' : 'Tambah murid'}</h2></div><button type="button" className="icon-button" onClick={() => setEditingStudent(null)} aria-label="Tutup"><X size={18} /></button></div><label>Nama murid<input required maxLength={100} placeholder="Nama lengkap murid" value={editingStudent.name} onChange={(event) => setEditingStudent((current) => ({ ...current, name: event.target.value }))} /></label><label>Tempatkan di kelas<select required value={editingStudent.classId} onChange={(event) => setEditingStudent((current) => ({ ...current, classId: event.target.value }))}>{classrooms.map((item) => <option key={item.id} value={item.id}>Kelas {item.name} · tingkat {item.grade}</option>)}</select></label>{formError && <div className="form-error"><CircleHelp size={15} />{formError}</div>}<div className="management-modal-actions"><button type="button" className="button button-outline" onClick={() => setEditingStudent(null)}>Batal</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : editingStudent.id ? 'Simpan perubahan' : 'Tambah murid'}</button></div></form></div>}
    </div>
  )
}

function GamePage({ classroom, questionSets, onNavigate }) {
  const [selectedGame, setSelectedGame] = useState('')

  if (selectedGame === 'treasure') {
    return <TreasureHuntGame classroom={classroom} questionSets={questionSets} onBack={() => setSelectedGame('')} onNavigate={onNavigate} />
  }
  if (selectedGame === 'clash') {
    return <ClashOfClanGame classroom={classroom} questionSets={questionSets} onBack={() => setSelectedGame('')} />
  }
  if (selectedGame === 'true-false') {
    return <TrueFalseGame classroom={classroom} questionSets={questionSets} onNavigate={onNavigate} onBack={() => setSelectedGame('')} />
  }

  return (
    <div className="page-section game-page">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">STUDIO AKTIVITAS KELAS {classroom.name}</span>
          <h1>Pilih permainan <span className="title-sparkle">✳</span></h1>
          <p>Pilih aktivitas untuk dimainkan bersama kelas {classroom.name}.</p>
        </div>
        <span className="game-ready-badge"><span /> SIAP DIMULAI</span>
      </section>
      <section className="game-picker-grid" aria-label="Daftar permainan">
        <article className="game-picker-card">
          <span className="game-picker-icon"><Check size={24} /></span>
          <span className="eyebrow">BERGERAK & MENJAWAB</span>
          <h2>Benar atau salah?</h2>
          <p>Siswa memilih zona jawaban di depan kamera. Pertanyaan berasal dari paket soal untuk kelas ini.</p>
          <button className="button button-outline" type="button" onClick={() => setSelectedGame('true-false')}>Pilih permainan <ArrowRight size={16} /></button>
        </article>
        <article className="game-picker-card treasure-picker-card">
          <span className="game-picker-icon"><Sparkles size={24} /></span>
          <span className="eyebrow">KERJA SAMA TIM</span>
          <h2>Berburu harta karun</h2>
          <p>Bagi siswa secara acak ke beberapa tim. Pilih satu kotak dari enam kesempatan per tim dan jawab soal untuk mengumpulkan poin.</p>
          <button className="button button-primary" type="button" onClick={() => setSelectedGame('treasure')}>Pilih permainan <ArrowRight size={16} /></button>
        </article>
        <article className="game-picker-card clash-picker-card">
          <span className="game-picker-icon"><UsersRound size={24} /></span>
          <span className="eyebrow">STRATEGI & KERJA SAMA</span>
          <h2>Clash of Clan</h2>
          <p>Acak siswa ke dalam tim. Semua tim membaca setiap soal secara bergiliran, lalu jawab untuk mengisi piala dan memuncaki papan skor.</p>
          <button className="button button-primary" type="button" onClick={() => setSelectedGame('clash')}>Pilih permainan <ArrowRight size={16} /></button>
        </article>
      </section>
    </div>
  )
}

function TrueFalseGame({ classroom, questionSets, onNavigate, onBack }) {
  const [selectedSetId, setSelectedSetId] = useState('')
  const [duration, setDuration] = useState(10)
  const [phase, setPhase] = useState('setup')
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraLoading, setCameraLoading] = useState(false)
  const [setError, setSetError] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [remaining, setRemaining] = useState(10)
  const [zoneCounts, setZoneCounts] = useState({ trueCount: 0, falseCount: 0 })
  const [roundResults, setRoundResults] = useState([])
  const [countdownText, setCountdownText] = useState('')
  const zoneCountsRef = useRef(zoneCounts)
  const startTimeouts = useRef([])

  const availableSets = questionSets.filter((set) => Number(set.grade) === Number(classroom.grade))
  const selectedSet = availableSets.find((set) => set.id === selectedSetId) ?? availableSets[0]
  const currentQuestion = selectedSet?.questions[questionIndex]
  const correctCount = roundResults.reduce(
    (total, round) => total + (round.answer ? round.trueCount : round.falseCount),
    0,
  )
  const totalResponses = roundResults.reduce((total, round) => total + round.trueCount + round.falseCount, 0)

  function recordZoneCounts(counts) {
    zoneCountsRef.current = counts
    setZoneCounts(counts)
  }

  useEffect(() => {
    if (phase !== 'countdown' || countdownText) return undefined
    const interval = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(interval)
          setPhase('reveal')
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [phase, countdownText])

  useEffect(() => {
    if (phase !== 'reveal') return undefined
    setRoundResults((current) => [
      ...current.filter((round) => round.questionId !== currentQuestion.id),
      {
        questionId: currentQuestion.id,
        trueCount: zoneCountsRef.current.trueCount,
        falseCount: zoneCountsRef.current.falseCount,
        answer: currentQuestion.answer,
      },
    ])
    const timeout = window.setTimeout(() => {
      if (questionIndex + 1 >= (selectedSet?.questions.length ?? 0)) {
        setPhase('summary')
        return
      }
      setQuestionIndex((current) => current + 1)
      setRemaining(duration)
      recordZoneCounts({ trueCount: 0, falseCount: 0 })
      setPhase('countdown')
    }, 3800)
    return () => window.clearTimeout(timeout)
  }, [phase, questionIndex, selectedSet, duration, currentQuestion])

  useEffect(() => () => {
    cameraStream?.getTracks().forEach((track) => track.stop())
  }, [cameraStream])

  useEffect(() => {
    if (phase !== 'summary') return
    cameraStream?.getTracks().forEach((track) => track.stop())
  }, [phase, cameraStream])

  function clearStartTimeouts() {
    startTimeouts.current.forEach((timeout) => window.clearTimeout(timeout))
    startTimeouts.current = []
  }

  async function beginGame() {
    if (!selectedSet?.questions.length) {
      setSetError('Belum ada paket soal yang cocok untuk tingkat kelas ini. Buat paket soal kelas ini terlebih dahulu.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini tidak mendukung kamera. Gunakan Chrome, Edge, atau Safari melalui koneksi HTTPS.')
      return
    }
    setCameraLoading(true)
    setCameraError('')
    setSetError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      setCameraStream(stream)
      setQuestionIndex(0)
      setRemaining(duration)
      recordZoneCounts({ trueCount: 0, falseCount: 0 })
      setRoundResults([])
      setPhase('countdown')
      clearStartTimeouts()
      setCountdownText('3')
      startTimeouts.current = [
        window.setTimeout(() => setCountdownText('2'), 750),
        window.setTimeout(() => setCountdownText('1'), 1500),
        window.setTimeout(() => setCountdownText(''), 2250),
      ]
    } catch (error) {
      setCameraError(error.name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser untuk memulai permainan.' : 'Kamera tidak dapat dibuka. Pastikan kamera tidak sedang digunakan aplikasi lain.')
    } finally {
      setCameraLoading(false)
    }
  }

  function closeGame() {
    clearStartTimeouts()
    cameraStream?.getTracks().forEach((track) => track.stop())
    setCameraStream(null)
    setCountdownText('')
    setPhase('setup')
  }

  async function replayGame() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      setCameraStream(stream)
      setQuestionIndex(0)
      recordZoneCounts({ trueCount: 0, falseCount: 0 })
      setRoundResults([])
      setRemaining(duration)
      setPhase('countdown')
      setCountdownText('3')
      clearStartTimeouts()
      startTimeouts.current = [
        window.setTimeout(() => setCountdownText('2'), 750),
        window.setTimeout(() => setCountdownText('1'), 1500),
        window.setTimeout(() => setCountdownText(''), 2250),
      ]
    } catch {
      setCameraError('Kamera tidak dapat dibuka kembali. Izinkan akses kamera untuk memainkan ulang.')
      setPhase('setup')
    }
  }

  if (phase === 'setup') {
    return     <div className="page-section game-page"><section className="page-title-row"><div><button className="game-back-link" type="button" onClick={onBack}><ArrowLeft size={14} /> Semua permainan</button><span className="eyebrow">STUDIO AKTIVITAS KELAS {classroom.name}</span><h1>Benar atau salah? <span className="title-sparkle">✳</span></h1><p>Ubah ruang kelas jadi arena belajar yang penuh gerak.</p></div><span className="game-ready-badge"><span /> SIAP DIMULAI</span></section>
      <div className="game-setup-layout"><section className="game-setup-card"><div className="setup-heading"><span className="setup-number">01</span><div><span className="eyebrow">SEBELUM BERMAIN</span><h2>Atur permainanmu</h2></div></div>{availableSets.length === 0 && <div className="no-question-kits"><CircleHelp size={16} /><span>Belum ada paket soal untuk kelas {classroom.grade}.</span><button type="button" onClick={() => onNavigate('questions')}>Buka bank soal <ArrowRight size={13} /></button></div>}<label className="setup-label">Pilih paket soal<span className="setup-hint">Materi yang sesuai untuk tingkat kelas {classroom.grade}.</span><div className="select-with-icon"><BookOpen size={17} /><select value={selectedSet?.id ?? ''} onChange={(event) => { setSelectedSetId(event.target.value); setSetError('') }}>{availableSets.map((set) => <option key={set.id} value={set.id}>{set.title} · {set.questions.length} soal</option>)}</select><ChevronDown size={16} /></div></label><label className="setup-label">Waktu berpikir per soal<span className="setup-hint">Hitung mundur dimulai setelah semua siap.</span><div className="duration-control"><button type="button" onClick={() => setDuration((value) => Math.max(5, value - 5))} disabled={duration <= 5} aria-label="Kurangi waktu"><span>−</span></button><strong>{duration}<small>detik</small></strong><button type="button" onClick={() => setDuration((value) => Math.min(30, value + 5))} disabled={duration >= 30} aria-label="Tambah waktu"><span>+</span></button><span className="duration-presets"><button type="button" className={duration === 10 ? 'selected' : ''} onClick={() => setDuration(10)}>10 dtk</button><button type="button" className={duration === 20 ? 'selected' : ''} onClick={() => setDuration(20)}>20 dtk</button><button type="button" className={duration === 30 ? 'selected' : ''} onClick={() => setDuration(30)}>30 dtk</button></span></div></label><div className="camera-permission"><span className="camera-permission-icon"><Camera size={18} /></span><span><strong>Kamera kelas</strong><small>Kamera menampilkan video langsung dan hitungan orang di setiap zona; sistem tidak menebak identitas.</small></span><span className="permission-tag">DIPERLUKAN</span></div>{cameraError && <div className="form-error camera-error"><CircleHelp size={16} />{cameraError}</div>}{setError && <div className="form-error camera-error"><CircleHelp size={16} />{setError}</div>}<button className="button button-primary setup-start" disabled={cameraLoading || !selectedSet} onClick={beginGame}>{cameraLoading ? <><LoaderCircle className="spin" size={17} /> Membuka kamera...</> : <><Camera size={17} /> Izinkan kamera & mulai <ArrowRight size={16} /></>}</button><p className="privacy-note"><span>▧</span> Video dihitung langsung di perangkat; tidak disimpan atau diunggah.</p></section>
        <aside className="game-preview-card"><div className="preview-top"><span className="eyebrow">AREA BERMAIN</span><span className="preview-camera-status"><span /> KAMERA SIAP</span></div><div className="preview-stage"><div className="preview-outline"><span className="preview-silhouette"><span /></span><span className="preview-floor floor-left" /><span className="preview-floor floor-right" /><div className="preview-boxes"><span className="preview-box preview-true"><Check size={18} /><strong>BENAR</strong><small>berdiri di sini</small></span><span className="preview-box preview-false"><X size={18} /><strong>SALAH</strong><small>berdiri di sini</small></span></div><span className="preview-camera-label"><Video size={13} /> TAMPILAN KAMERA AKAN MUNCUL DI SINI</span></div></div><div className="preview-caption"><div className="caption-icon"><ArrowDownRight size={17} /></div><p><strong>Pilih kotak jawaban.</strong><br />Hitungan orang di setiap zona diproses langsung dari kamera tanpa menampilkan identitas.</p></div></aside></div>
    </div>
  }

  if (phase === 'summary') {
    const accuracy = totalResponses ? Math.round((correctCount / totalResponses) * 100) : 0
    return <div className="game-summary"><div className="summary-confetti">✳</div><span className="eyebrow">PERMAINAN SELESAI</span><h1>Hebat, {classroom.name}! <span className="wave">✳</span></h1><p>Kelasmu menyelesaikan tantangan <strong>{selectedSet?.title}</strong>.</p><div className="summary-score"><span className="summary-medal">✦</span><span className="eyebrow">ORANG DI ZONA JAWABAN TEPAT</span><strong>{correctCount}<small> / {totalResponses}</small></strong><span className="summary-accuracy">{accuracy}% ketepatan berdasarkan hitungan kamera</span></div><div className="summary-actions"><button className="button button-primary" onClick={closeGame}><ArrowLeft size={16} /> Kembali ke pengaturan</button><button className="button button-outline" onClick={replayGame}>Mainkan lagi <ArrowRight size={16} /></button></div><button className="summary-close" onClick={closeGame}>Selesai dan tutup</button></div>
  }

  return <FullscreenGame
    question={currentQuestion}
    remaining={remaining}
    phase={phase}
    countdownText={countdownText}
    cameraStream={cameraStream}
    zoneCounts={zoneCounts}
    onClose={closeGame}
    onZoneCounts={recordZoneCounts}
  />
}

export default App
