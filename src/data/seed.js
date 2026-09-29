export const teachers = [
  { id: 'nafi', name: 'Ratna Puspita', title: 'Bu Ratna', email: 'nafi@ruangmain.id', password: 'belajar123' },
  { id: 'arif', name: 'Arif Nugroho', title: 'Pak Arif', email: 'arif@ruangmain.id', password: 'belajar123' },
]

export const administrators = [
  { id: 'admin-sekolah', name: 'Administrator', title: 'Admin Sekolah', email: 'admin@ruangmain.id', password: 'admin123' },
]

export const seedClasses = [
  {
    id: 'kelas-5a',
    name: '5A',
    grade: 5,
    teacherId: 'nafi',
    students: [
      { id: 's-101', name: 'Alya Putri', number: 1, color: '#ffc9a8' },
      { id: 's-102', name: 'Bima Pratama', number: 2, color: '#b8d8ff' },
      { id: 's-103', name: 'Citra Maharani', number: 3, color: '#d2c4ff' },
      { id: 's-104', name: 'Daffa Ramadhan', number: 4, color: '#b8eadb' },
      { id: 's-105', name: 'Intan Permata', number: 5, color: '#ffd5e2' },
      { id: 's-106', name: 'Rafi Akbar', number: 6, color: '#f5dda0' },
      { id: 's-107', name: 'Nadia Safitri', number: 7, color: '#c7e6a6' },
      { id: 's-108', name: 'Rizky Maulana', number: 8, color: '#ffc2c2' },
      { id: 's-109', name: 'Salsabila A.', number: 9, color: '#bce1e6' },
      { id: 's-110', name: 'Yoga Prakoso', number: 10, color: '#dfc7a9' },
      { id: 's-111', name: 'Zahra Nabila', number: 11, color: '#f3c6a6' },
      { id: 's-112', name: 'Farel Wijaya', number: 12, color: '#c7cef9' },
    ],
  },
  {
    id: 'kelas-5b',
    name: '5B',
    grade: 5,
    teacherId: 'nafi',
    students: [
      { id: 'b-201', name: 'Aditya Nugraha', number: 1, color: '#b8d8ff' },
      { id: 'b-202', name: 'Bella Anjani', number: 2, color: '#ffd5e2' },
      { id: 'b-203', name: 'Cahya Putra', number: 3, color: '#f5dda0' },
      { id: 'b-204', name: 'Dewi Anggraini', number: 4, color: '#b8eadb' },
      { id: 'b-205', name: 'Fikri Hidayat', number: 5, color: '#ffc9a8' },
      { id: 'b-206', name: 'Maya Lestari', number: 6, color: '#d2c4ff' },
    ],
  },
  {
    id: 'kelas-4a',
    name: '4A',
    grade: 4,
    teacherId: 'arif',
    students: [
      { id: 'a-301', name: 'Aisyah Putri', number: 1, color: '#ffd5e2' },
      { id: 'a-302', name: 'Bagas Santoso', number: 2, color: '#b8d8ff' },
      { id: 'a-303', name: 'Dinda Ayu', number: 3, color: '#f5dda0' },
      { id: 'a-304', name: 'Farhan Malik', number: 4, color: '#b8eadb' },
      { id: 'a-305', name: 'Naufal R.', number: 5, color: '#d2c4ff' },
      { id: 'a-306', name: 'Putri Amelia', number: 6, color: '#ffc9a8' },
    ],
  },
]

export const seedQuestionSets = [
  {
    id: 'paket-sains-1',
    teacherId: 'ratna',
    title: 'Ekosistem dan rantai makanan',
    grade: 5,
    subject: 'IPAS',
    material: 'Ekosistem dan rantai makanan',
    createdAt: '2026-09-18T08:30:00.000Z',
    questions: [
      { id: 'q-1', statement: 'Tumbuhan hijau dapat membuat makanannya sendiri melalui fotosintesis.', answer: true, explanation: 'Tumbuhan memiliki klorofil yang membantu mengubah cahaya matahari menjadi makanan.' },
      { id: 'q-2', statement: 'Dalam rantai makanan, elang biasanya berperan sebagai produsen.', answer: false, explanation: 'Elang adalah konsumen tingkat tinggi. Produsen biasanya berupa tumbuhan.' },
      { id: 'q-3', statement: 'Padi dapat menjadi sumber makanan bagi belalang.', answer: true, explanation: 'Belalang memakan tumbuhan, termasuk bagian dari tanaman padi.' },
      { id: 'q-4', statement: 'Semua hewan mendapatkan energi dengan cara yang sama seperti tumbuhan.', answer: false, explanation: 'Hewan mendapatkan energi dengan memakan organisme lain.' },
      { id: 'q-5', statement: 'Jika jumlah ular berkurang, jumlah tikus bisa meningkat.', answer: true, explanation: 'Ular memangsa tikus, sehingga berkurangnya ular dapat membuat lebih banyak tikus bertahan hidup.' },
    ],
  },
  {
    id: 'paket-matematika-1',
    teacherId: 'ratna',
    title: 'Pecahan sederhana',
    grade: 5,
    subject: 'Matematika',
    material: 'Pecahan dan perbandingan sederhana',
    createdAt: '2026-09-16T08:30:00.000Z',
    questions: [
      { id: 'q-6', statement: 'Pecahan 1/2 memiliki nilai yang sama dengan 2/4.', answer: true, explanation: 'Pembilang dan penyebut 1/2 dapat dikalikan 2 sehingga menjadi 2/4.' },
      { id: 'q-7', statement: 'Pecahan 3/4 lebih kecil daripada 1/2.', answer: false, explanation: 'Tiga per empat lebih besar daripada setengah.' },
      { id: 'q-8', statement: 'Jika satu pizza dibagi menjadi 8 bagian sama besar, 2 bagian bernilai 1/4 pizza.', answer: true, explanation: 'Dua per delapan dapat disederhanakan menjadi satu per empat.' },
    ],
  },
  {
    id: 'paket-ipas-kelas-4',
    teacherId: 'arif',
    title: 'Gaya dan gerak di sekitar kita',
    grade: 4,
    subject: 'IPAS',
    material: 'Pengaruh gaya terhadap gerak dan bentuk benda',
    createdAt: '2026-09-15T08:30:00.000Z',
    questions: [
      { id: 'q-9', statement: 'Mendorong meja dapat membuat meja yang diam menjadi bergerak.', answer: true, explanation: 'Dorongan adalah gaya yang dapat mengubah benda diam menjadi bergerak.' },
      { id: 'q-10', statement: 'Gaya hanya dapat mengubah arah gerak benda dan tidak dapat mengubah bentuknya.', answer: false, explanation: 'Gaya juga dapat mengubah bentuk benda, misalnya saat plastisin ditekan.' },
      { id: 'q-11', statement: 'Menarik rem sepeda dapat membantu memperlambat laju sepeda.', answer: true, explanation: 'Gaya gesek pada rem membantu memperlambat putaran roda sepeda.' },
    ],
  },
]
