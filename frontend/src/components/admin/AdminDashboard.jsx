/**
 * SmartProctor - Admin Dashboard
 * Sistem istatistikleri ve hızlı erişim.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../../services/api'
import {
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  UserCog,
  Shield,
  ArrowRight,
  Loader2,
} from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const res = await adminAPI.getStats()
      setStats(res.data)
    } catch (err) {
      console.error('Stats yüklenemedi:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const statCards = [
    {
      label: 'Toplam Kullanıcı',
      value: stats?.total_users || 0,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      label: 'Öğrenci',
      value: stats?.total_students || 0,
      icon: GraduationCap,
      color: 'bg-green-500',
    },
    {
      label: 'Eğitmen',
      value: stats?.total_instructors || 0,
      icon: UserCog,
      color: 'bg-indigo-500',
    },
    {
      label: 'Gözetmen',
      value: stats?.total_proctors || 0,
      icon: Shield,
      color: 'bg-yellow-500',
    },
    {
      label: 'Ders',
      value: stats?.total_courses || 0,
      icon: BookOpen,
      color: 'bg-purple-500',
    },
    {
      label: 'Sınav',
      value: stats?.total_exams || 0,
      icon: ClipboardList,
      color: 'bg-red-500',
    },
  ]

  const quickLinks = [
    {
      label: 'Ders Yönetimi',
      description: 'Ders oluştur ve eğitmen ata',
      path: '/admin/courses',
      icon: BookOpen,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      label: 'Kullanıcı Yönetimi',
      description: 'Kullanıcıları görüntüle ve yönet',
      path: '/admin/users',
      icon: Users,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Öğrenci Atamaları',
      description: 'Öğrencileri derslere kaydet',
      path: '/admin/enrollments',
      icon: GraduationCap,
      color: 'text-green-600 bg-green-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Paneli</h1>
        <p className="text-gray-500">Sistem yönetimi ve istatistikler</p>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center mb-3`}>
              <stat.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Hızlı Erişim */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hızlı Erişim</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition group"
            >
              <div className={`w-12 h-12 ${link.color} rounded-xl flex items-center justify-center mb-4`}>
                <link.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                {link.label}
                <ArrowRight
                  size={16}
                  className="opacity-0 group-hover:opacity-100 transition transform group-hover:translate-x-1"
                />
              </h3>
              <p className="text-sm text-gray-500">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Sistem İşleyişi */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-900 mb-2">📋 Sistem İşleyişi</h3>
        <div className="text-sm text-blue-800 space-y-1">
          <p>
            <strong>1.</strong> Admin dersleri oluşturur ve eğitmenleri derslere atar.
          </p>
          <p>
            <strong>2.</strong> Eğitmen öğrencileri kendi derslerine kaydeder ve sınav oluşturur.
          </p>
          <p>
            <strong>3.</strong> Öğrenci sadece kayıtlı olduğu derslerin sınavlarını görebilir.
          </p>
        </div>
      </div>
    </div>
  )
}