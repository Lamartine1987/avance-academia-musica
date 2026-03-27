export type UserRole = 'admin' | 'teacher' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  teacherId?: string;
  studentId?: string;
  mustChangePassword?: boolean;
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
  status: 'scheduled' | 'completed' | 'cancelled' | 'needs_reschedule' | 'rescheduled';
  notes?: string;
  isMakeup?: boolean;
}

export interface BlockedTime {
  id: string;
  startTime: any;
  endTime: any;
  reason?: string;
  teacherId?: string; // If undefined, applies to all teachers
  createdAt: any;
}

export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  month: number;
  year: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  whatsappSent: ('pre-due' | 'due' | 'overdue')[];
  createdAt: any;
  paidAt?: any;
}

export interface IntegrationsSettings {
  zapiInstance: string;
  zapiToken: string;
  zapiSecurityToken?: string;
  schoolPhone?: string;
  remindersEnabled?: boolean;
  reminderDaysBefore?: boolean;
  reminderDaysBeforeCount?: number;
  sendOnDue?: boolean;
  reminderDaysAfter?: boolean;
  reminderDaysAfterCount?: number;
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string;
  type: 'welcome' | 'promo' | 'reminder_predue' | 'reminder_due' | 'reminder_overdue' | 'custom';
  isAutomatic: boolean;
  createdAt: any;
}
