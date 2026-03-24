export type UserRole = 'admin' | 'teacher' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  teacherId?: string;
  createdAt: any;
}

export interface ScheduleItem {
  day: number; // 0-6
  time: string; // HH:mm
}

export interface CourseEnrollment {
  instrument: string;
  teacherId: string;
  duration: number;
  schedule: ScheduleItem[];
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  fatherName?: string;
  motherName?: string;
  enrollments: CourseEnrollment[];
  level?: 'beginner' | 'intermediate' | 'advanced';
  status: 'active' | 'inactive';
  courseValue?: number;
  dueDate?: number;
  createdAt: any;
}

export interface Teacher {
  id: string;
  name: string;
  email?: string;
  instruments: string[];
  bio?: string;
  role?: 'admin' | 'teacher';
  maxStudents?: number;
  createdAt: any;
}

export interface Instrument {
  id: string;
  name: string;
  createdAt: any;
}

export interface Lesson {
  id: string;
  studentId: string;
  teacherId: string;
  instrument: string;
  startTime: any;
  endTime: any;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

export interface BlockedTime {
  id: string;
  startTime: any;
  endTime: any;
  reason?: string;
  teacherId?: string; // If undefined, applies to all teachers
  createdAt: any;
}
