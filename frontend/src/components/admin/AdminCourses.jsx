/**
 * SmartProctor - Admin Ders Yönetimi
 * Ders oluşturma ve eğitmen atama.
 */

import { useState, useEffect } from 'react'
import { courseAPI, authAPI } from '../../services/api'
import {
  BookOpen,
  Plus,
  UserPlus,
  UserMinus,
  X,
  Loader2,
  Search,
  AlertCircle,
} from 'lucide-react'

export default function AdminCourses() {
  const [courses, setCourses] = useState([])
  const [instructors, setInstructors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')

  const [newCourse, setNewCourse] = useState({
    code: '',
    name: '',
    description: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [coursesRes, instructorsRes] = await Promise.all([
        courseAPI.listAll(),
        authAPI.getInstructors(),
      ])
      setCourses(coursesRes.data)
      setInstructors(instructorsRes.data)
    } catch (err) {
      console.error('Veri yüklenemedi:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCourse = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await courseAPI.create(newCourse)
      setShowCreateModal(false)
      setNewCourse({ code: '', name: '', description: '' })
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Ders oluşturulamadı')
    }
  }

  const handleAssignInstructor = async (instructorId) => {
    try {
      await courseAPI.assignInstructor(selectedCourse.id, instructorId)
      setShowAssignModal(false)
      setSelectedCourse(null)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Eğitmen atanamadı')
    }
  }

  const handleRemoveInstructor = async (courseId) => {
    if (!confirm('Eğitmeni kaldırmak istediğinize emin misiniz?')) return
    try {
      await courseAPI.removeInstructor(courseId)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Eğitmen kaldırılamadı')
    }
  }

  const filteredCourses = courses.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ders Yönetimi</h1>
          <p className="text-gray-500">Ders oluşturun ve eğitmen atayın</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          Yeni Ders
        </button>
      </div>

      {/* Arama */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Ders ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Ders Listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Kod</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Ders Adı</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Eğitmen</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Durum</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredCourses.map((course) => (
              <tr key={course.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                    {course.code}
                  </span>
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">{course.name}</td>
                <td className="px-6 py-4">
                  {course.instructor ? (
                    <span className="text-gray-700">
                      {course.instructor.first_name} {course.instructor.last_name}
                    </span>
                  ) : (
                    <span className="text-orange-600 flex items-center gap-1">
                      <AlertCircle size={16} />
                      Atanmadı
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      course.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {course.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {course.instructor ? (
                    <button
                      onClick={() => handleRemoveInstructor(course.id)}
                      className="text-red-600 hover:text-red-700 p-1"
                      title="Eğitmeni Kaldır"
                    >
                      <UserMinus size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedCourse(course)
                        setShowAssignModal(true)
                      }}
                      className="text-blue-600 hover:text-blue-700 p-1"
                      title="Eğitmen Ata"
                    >
                      <UserPlus size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredCourses.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Henüz ders bulunmuyor</p>
          </div>
        )}
      </div>

      {/* Yeni Ders Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Yeni Ders Oluştur</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ders Kodu</label>
                <input
                  type="text"
                  value={newCourse.code}
                  onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                  placeholder="Örn: BIL101"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ders Adı</label>
                <input
                  type="text"
                  value={newCourse.name}
                  onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                  placeholder="Örn: Programlamaya Giriş"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                <textarea
                  value={newCourse.description}
                  onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                  placeholder="Ders açıklaması (isteğe bağlı)"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Eğitmen Ata Modal */}
      {showAssignModal && selectedCourse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Eğitmen Ata</h2>
                <p className="text-sm text-gray-500">{selectedCourse.name}</p>
              </div>
              <button
                onClick={() => {
                  setShowAssignModal(false)
                  setSelectedCourse(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {instructors.map((instructor) => (
                <button
                  key={instructor.id}
                  onClick={() => handleAssignInstructor(instructor.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition text-left"
                >
                  <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-medium">
                    {instructor.first_name[0]}
                    {instructor.last_name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {instructor.first_name} {instructor.last_name}
                    </p>
                    <p className="text-sm text-gray-500">{instructor.email}</p>
                  </div>
                </button>
              ))}

              {instructors.length === 0 && (
                <p className="text-center text-gray-500 py-4">Eğitmen bulunamadı</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}