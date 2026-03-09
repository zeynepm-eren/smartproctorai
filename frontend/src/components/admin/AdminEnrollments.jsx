/**
 * SmartProctor - Admin Öğrenci Atama
 * Öğrencileri derslere kaydetme.
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

export default function AdminEnrollments() {
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
        courseAPI.listAll(),
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

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Öğrenci Atamaları</h1>
        <p className="text-gray-500">Öğrencileri derslere kaydedin</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sol Panel - Ders Listesi */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BookOpen size={20} />
            Dersler
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => setSelectedCourse(course)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selectedCourse?.id === course.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-medium text-gray-900">{course.name}</p>
                <p className="text-sm text-gray-500">{course.code}</p>
              </button>
            ))}

            {courses.length === 0 && (
              <p className="text-center text-gray-500 py-4">Ders bulunamadı</p>
            )}
          </div>
        </div>

        {/* Sağ Panel - Öğrenci Listeleri */}
        <div className="lg:col-span-2 space-y-6">
          {selectedCourse ? (
            <>
              {/* Kayıtlı Öğrenciler */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle size={20} className="text-green-600" />
                  Kayıtlı Öğrenciler ({enrolledStudents.length})
                </h2>
                <div className="space-y-2 max-h-48 overflow-y-auto">
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

                <div className="space-y-2 max-h-64 overflow-y-auto">
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
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Lütfen bir ders seçin</p>
            </div>
          )}
        </div>
      </div>

      {/* Bilgi Kutusu */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          💡 <strong>İpucu:</strong> Bir öğrenciyi derse kaydettiğinizde, o dersin sınavları
          otomatik olarak öğrencinin panelinde görünür hale gelir.
        </p>
      </div>
    </div>
  )
}