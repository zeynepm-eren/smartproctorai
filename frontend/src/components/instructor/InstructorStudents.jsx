/**
 * SmartProctor - Eğitmen Öğrenci Yönetimi
 * Eğitmenin kendi derslerine öğrenci ataması.
 */

import { useState, useEffect } from 'react'
import { courseAPI, authAPI } from '../../services/api'
import {
  GraduationCap,
  BookOpen,
  UserPlus,
  UserMinus,
  Loader2,
  Search,
  CheckCircle,
} from 'lucide-react'

export default function InstructorStudents() {
  const [courses, setCourses] = useState([])
  const [students, setStudents] = useState([])
  const [enrolledStudents, setEnrolledStudents] = useState([])
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedCourse) {
      loadEnrolledStudents()
    }
  }, [selectedCourse])

  const loadInitialData = async () => {
    try {
      const [coursesRes, studentsRes] = await Promise.all([
        courseAPI.list(), // Eğitmenin kendi dersleri
        authAPI.getStudents(),
      ])
      setCourses(coursesRes.data)
      setStudents(studentsRes.data)
      if (coursesRes.data.length > 0) {
        setSelectedCourse(coursesRes.data[0])
      }
    } catch (err) {
      console.error('Veri yüklenemedi:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadEnrolledStudents = async () => {
    if (!selectedCourse) return
    try {
      const res = await courseAPI.students(selectedCourse.id)
      setEnrolledStudents(res.data)
    } catch (err) {
      console.error('Kayıtlı öğrenciler yüklenemedi:', err)
    }
  }

  const handleEnroll = async (studentId) => {
    setEnrollLoading(true)
    try {
      await courseAPI.enroll(selectedCourse.id, studentId)
      loadEnrolledStudents()
    } catch (err) {
      alert(err.response?.data?.detail || 'Kayıt başarısız')
    } finally {
      setEnrollLoading(false)
    }
  }

  const handleUnenroll = async (studentId) => {
    if (!confirm('Öğrenciyi dersten çıkarmak istediğinize emin misiniz?')) return
    try {
      await courseAPI.unenroll(selectedCourse.id, studentId)
      loadEnrolledStudents()
    } catch (err) {
      alert(err.response?.data?.detail || 'İşlem başarısız')
    }
  }

  const enrolledIds = enrolledStudents.map((e) => e.student_id)
  const unenrolledStudents = students.filter((s) => !enrolledIds.includes(s.id))

  const filteredUnenrolled = unenrolledStudents.filter(
    (s) =>
      s.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Henüz Dersiniz Yok</h2>
        <p className="text-gray-500">
          Size atanmış bir ders bulunmuyor. Lütfen admin ile iletişime geçin.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Öğrenci Yönetimi</h1>
        <p className="text-gray-500">Derslerinize öğrenci ekleyin veya çıkarın</p>
      </div>

      {/* Ders Seçimi */}
      <div className="flex flex-wrap gap-2">
        {courses.map((course) => (
          <button
            key={course.id}
            onClick={() => setSelectedCourse(course)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              selectedCourse?.id === course.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {course.code}
          </button>
        ))}
      </div>

      {selectedCourse && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Kayıtlı Öğrenciler */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle size={20} className="text-green-600" />
              Kayıtlı Öğrenciler ({enrolledStudents.length})
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {enrolledStudents.map((enrollment) => (
                <div
                  key={enrollment.id}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                      {enrollment.student?.first_name?.[0] || '?'}
                      {enrollment.student?.last_name?.[0] || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {enrollment.student?.first_name} {enrollment.student?.last_name}
                      </p>
                      <p className="text-sm text-gray-500">{enrollment.student?.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnenroll(enrollment.student_id)}
                    className="text-red-600 hover:text-red-700 p-1"
                    title="Dersten Çıkar"
                  >
                    <UserMinus size={18} />
                  </button>
                </div>
              ))}

              {enrolledStudents.length === 0 && (
                <p className="text-center text-gray-500 py-4">Henüz kayıtlı öğrenci yok</p>
              )}
            </div>
          </div>

          {/* Kayıtsız Öğrenciler */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <GraduationCap size={20} className="text-blue-600" />
              Kayıtsız Öğrenciler ({unenrolledStudents.length})
            </h2>

            {/* Arama */}
            <div className="relative mb-4">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Öğrenci ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredUnenrolled.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-400 text-white rounded-full flex items-center justify-center text-sm font-medium">
                      {student.first_name[0]}
                      {student.last_name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {student.first_name} {student.last_name}
                      </p>
                      <p className="text-sm text-gray-500">{student.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleEnroll(student.id)}
                    disabled={enrollLoading}
                    className="text-blue-600 hover:text-blue-700 p-1 disabled:opacity-50"
                    title="Derse Kaydet"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>
              ))}

              {filteredUnenrolled.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  {searchTerm ? 'Sonuç bulunamadı' : 'Tüm öğrenciler kayıtlı'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bilgi Kutusu */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          💡 <strong>İpucu:</strong> Bir öğrenciyi derse kaydettiğinizde, bu derse ait sınavlarınız
          otomatik olarak öğrencinin panelinde görünür.
        </p>
      </div>
    </div>
  )
}