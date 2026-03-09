/**
 * SmartProctor - Admin Kullanıcı Yönetimi
 * Kullanıcı listesi ve filtreleme.
 */

import { useState, useEffect } from 'react'
import { authAPI } from '../../services/api'
import { Users, Search, Loader2, Filter } from 'lucide-react'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  useEffect(() => {
    loadUsers()
  }, [roleFilter])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const params = {}
      if (roleFilter) params.role = roleFilter
      if (searchTerm) params.search = searchTerm
      const res = await authAPI.getUsers(params)
      setUsers(res.data)
    } catch (err) {
      console.error('Kullanıcılar yüklenemedi:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    loadUsers()
  }

  const filteredUsers = users.filter(
    (u) =>
      u.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const roleLabel = {
    student: 'Öğrenci',
    instructor: 'Eğitmen',
    proctor: 'Gözetmen',
    admin: 'Admin',
  }

  const roleColor = {
    student: 'bg-green-100 text-green-700',
    instructor: 'bg-blue-100 text-blue-700',
    proctor: 'bg-yellow-100 text-yellow-700',
    admin: 'bg-purple-100 text-purple-700',
  }

  const avatarColor = {
    student: 'bg-green-500',
    instructor: 'bg-blue-500',
    proctor: 'bg-yellow-500',
    admin: 'bg-purple-500',
  }

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kullanıcı Yönetimi</h1>
        <p className="text-gray-500">Sistemdeki tüm kullanıcıları görüntüleyin</p>
      </div>

      {/* Arama ve Filtre */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="İsim veya email ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Tüm Roller</option>
            <option value="student">Öğrenci</option>
            <option value="instructor">Eğitmen</option>
            <option value="proctor">Gözetmen</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {/* Kullanıcı Listesi */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Kullanıcı</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Email</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Rol</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 ${avatarColor[user.role]} text-white rounded-full flex items-center justify-center font-medium`}
                      >
                        {user.first_name[0]}
                        {user.last_name[0]}
                      </div>
                      <span className="font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${roleColor[user.role]}`}>
                      {roleLabel[user.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {user.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Kullanıcı bulunamadı</p>
            </div>
          )}
        </div>
      )}

      {/* Özet */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span>Toplam: {filteredUsers.length} kullanıcı</span>
      </div>
    </div>
  )
}