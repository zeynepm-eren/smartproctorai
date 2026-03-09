/**
 * SmartProctor - API Servis Katmanı
 * Axios ile backend API iletişimi.
 * Token otomatik olarak header'a eklenir.
 */

import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: Token ekleme
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: 401 durumunda token yenileme
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh`, {
            refresh_token: refreshToken,
          })
          localStorage.setItem('access_token', res.data.access_token)
          localStorage.setItem('refresh_token', res.data.refresh_token)
          originalRequest.headers.Authorization = `Bearer ${res.data.access_token}`
          return api(originalRequest)
        } catch {
          // Refresh başarısız, çıkış yap
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// =============================================================================
// AUTH API
// =============================================================================
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  
  // Kullanıcı listeleri (Admin/Eğitmen)
  getUsers: (params) => api.get('/auth/users', { params }),
  getInstructors: () => api.get('/auth/instructors'),
  getStudents: () => api.get('/auth/students'),
  getProctors: () => api.get('/auth/proctors'),
}

// =============================================================================
// COURSES API
// =============================================================================
export const courseAPI = {
  // Temel CRUD
  list: () => api.get('/courses/'),
  listAll: () => api.get('/courses/all'),
  listUnassigned: () => api.get('/courses/unassigned'),
  get: (id) => api.get(`/courses/${id}`),
  create: (data) => api.post('/courses/', data),
  update: (id, data) => api.put(`/courses/${id}`, data),
  delete: (id) => api.delete(`/courses/${id}`),
  
  // Eğitmen atama (Admin)
  assignInstructor: (courseId, instructorId) =>
    api.post(`/courses/${courseId}/assign-instructor`, { instructor_id: instructorId }),
  removeInstructor: (courseId) =>
    api.delete(`/courses/${courseId}/remove-instructor`),
  
  // Öğrenci kayıt (Admin/Eğitmen)
  enroll: (courseId, studentId) =>
    api.post(`/courses/${courseId}/enroll`, { student_id: studentId }),
  enrollBulk: (courseId, studentIds) =>
    api.post(`/courses/${courseId}/enroll-bulk`, { student_ids: studentIds }),
  unenroll: (courseId, studentId) =>
    api.delete(`/courses/${courseId}/unenroll/${studentId}`),
  students: (courseId) => api.get(`/courses/${courseId}/students`),
}

// =============================================================================
// EXAMS API
// =============================================================================
export const examAPI = {
  list: () => api.get('/exams/'),
  create: (data) => api.post('/exams/', data),
  get: (id) => api.get(`/exams/${id}`),
  update: (id, data) => api.put(`/exams/${id}`, data),
  delete: (id) => api.delete(`/exams/${id}`),
  addQuestion: (examId, data) => api.post(`/exams/${examId}/questions`, data),
  listQuestions: (examId) => api.get(`/exams/${examId}/questions`),
  listQuestionsStudent: (examId) => api.get(`/exams/${examId}/questions/student`),
  
  // Gözetmen atama
  assignProctor: (examId, proctorId) =>
    api.post(`/exams/${examId}/assign-proctor`, { proctor_id: proctorId }),
  removeProctor: (examId, proctorId) =>
    api.delete(`/exams/${examId}/remove-proctor/${proctorId}`),
  
  // Sonuçlar
  getResults: (examId) => api.get(`/sessions/exam/${examId}/results`),
}

// =============================================================================
// SESSIONS API
// =============================================================================
export const sessionAPI = {
  start: (examId) => api.post(`/sessions/start/${examId}`),
  submitAnswer: (data) => api.post('/sessions/answer', data),
  finish: (sessionId) => api.post(`/sessions/finish/${sessionId}`),
  logTabSwitch: (sessionId) => api.post(`/sessions/tab-switch/${sessionId}`),
  mySessions: () => api.get('/sessions/my-sessions'),
}

// =============================================================================
// VIOLATIONS API
// =============================================================================
export const violationAPI = {
  log: (data) => api.post('/violations/log', data),
  uploadEvidence: (violationId, formData) =>
    api.post(`/violations/upload-evidence/${violationId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  pendingReviews: () => api.get('/violations/pending-reviews'),
  submitReview: (violationId, data) => api.post(`/violations/review/${violationId}`, data),
  listConflicts: () => api.get('/violations/conflicts'),
  resolveConflict: (violationId, data) =>
    api.post(`/violations/conflicts/${violationId}/resolve`, data),
}

// =============================================================================
// NOTIFICATIONS API
// =============================================================================
export const notificationAPI = {
  list: () => api.get('/notifications/'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/mark-all-read'),
}

// =============================================================================
// ADMIN API
// =============================================================================
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
}

export default api