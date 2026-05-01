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

export interface StudentDocument {
  id?: string;
  studentId: string;
  studentName: string;
  title: string;
  type: 'contract' | 'identification' | 'proof_of_address' | 'certificate' | 'other';
  url: string;
  createdAt: any;
}

export interface DocumentRequest {
  id?: string;
  studentId: string;
  studentName: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: any;
  observation?: string;
  documentUrl?: string; // Filled when approved
  approvedBy?: string; // Admin displayName
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
  systemLogin?: string;
  phone?: string;
  cpf?: string;
  rg?: string;
  nationality?: string;
  maritalStatus?: string;
  profession?: string;
  cep?: string;
  address?: string;
  addressNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  birthDate?: string;
  fatherName?: string;
  motherName?: string;
  responsibleName?: string;
  responsibleCpf?: string;
  responsibleRg?: string;
  responsiblePhone?: string;
  responsibleKinship?: string;
  isScholarship?: boolean;
  discount?: number;
  extraNotes?: string;
  classType?: 'individual' | 'group';
  enrollments: CourseEnrollment[];
  level?: 'beginner' | 'intermediate' | 'advanced';
  status: 'active' | 'inactive' | 'pending_approval' | 'rejected';
  courseValue?: number;
  dueDate?: number;
  billingStartDate?: string;
  lastEvaluationDate?: string;
  enrollmentDate?: string;
  contractUrl?: string;
  createdAt: any;
}

export interface Teacher {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  instruments: string[];
  bio?: string;
  role?: 'admin' | 'teacher';
  isTeacher?: boolean;
  maxStudents?: number;
  canManageLibrary?: boolean;
  createdAt: any;
}

export interface Instrument {
  id: string;
  name: string;
  defaultPrice?: number;
  individualPrice?: number;
  createdAt: any;
}

export interface Lesson {
  id: string;
  studentId: string; // Will store 'trial' for trial lessons
  teacherId: string;
  instrument: string;
  startTime: any;
  endTime: any;
  status: 'scheduled' | 'completed' | 'cancelled' | 'needs_reschedule' | 'rescheduled';
  notes?: string;
  photoUrls?: string[];
  isMakeup?: boolean;
  isTrial?: boolean;
  studentName?: string;
  studentPhone?: string;
  isStudyTask?: boolean;
  topicId?: string;
  topicTitle?: string;
  topicUrl?: string;
  suggestedDuration?: number; // in minutes
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
  whatsappEngine?: 'zapi' | 'apiz';
  zapiInstance: string;
  zapiToken: string;
  zapiSecurityToken?: string;
  apizUrl?: string;
  apizToken?: string;
  apizInstanceName?: string;
  apizWebhook?: string;
  schoolPhone?: string;
  remindersEnabled?: boolean;
  reminderDaysBefore?: boolean;
  reminderDaysBeforeCount?: number;
  sendOnDue?: boolean;
  reminderDaysAfter?: boolean;
  reminderDaysAfterCount?: number;
  evaluationCycleDays?: number;
  notifyTeacherDaysBefore?: number;
  pixKey?: string;
  pixName?: string;
  pixCity?: string;
  interBankEnabled?: boolean;
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string;
  type: 'welcome' | 'promo' | 'reminder_predue' | 'reminder_due' | 'reminder_overdue' | 'custom' | 'reschedule' | 'evaluation' | 'pedagogic_reminder' | 'material_added' | 'enrollment_approved' | 'enrollment_rejected' | 'holiday_reminder';
  isAutomatic: boolean;
  createdAt: any;
}

export type MaterialType = 'pdf' | 'audio' | 'video' | 'link' | 'image';

export interface Material {
  id: string;
  title: string;
  url: string;
  type: MaterialType;
  description?: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[]; // empty means global
  isActive?: boolean;
  createdAt: any;
}

export interface EvaluationMetric {
  name: string;
  score: number; // 1 to 5
}

export interface Evaluation {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  instrument: string;
  date: string; // YYYY-MM-DD
  metrics: EvaluationMetric[];
  notes?: string;
  createdAt: any;
}

export interface SchoolEvent {
  id: string;
  title: string;
  type: 'holiday' | 'recess';
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  isEnabled: boolean;
  description?: string;
  createdAt: any;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  status: 'paid' | 'pending';
  createdAt: any;
}

export interface LibraryTopic {
  id: string;
  moduleName: string;
  title: string;
  url: string;
  type: 'pdf' | 'audio' | 'video' | 'link' | 'image';
  description?: string;
  createdBy: string;
  createdByName: string;
  visibleToStudents?: string[]; // IDs dos alunos
  createdAt: any;
}

export interface LibraryModule {
  id: string;
  name: string;
  createdAt: any;
}

export interface TeacherPaymentSettings {
  paymentDates: number[]; // e.g. [5, 15, 25]
  amountPerStudent: number; // e.g. 80.00
  amountPerTrialLesson: number; // e.g. 80.00
}

export interface TeacherPaymentAdjustment {
  id: string;
  teacherId: string;
  teacherName: string;
  description: string; // "Aula Teste", "Aula Avulsa", "Desconto", etc.
  amount: number; // Positive for additions, negative for discounts
  date: string; // YYYY-MM-DD
  createdAt: any;
}

export interface TeacherPaymentCycle {
  id?: string;
  teacherId: string;
  cycle: 1 | 2 | 3;
  month: number;
  year: number;
  amount: number;
  paidAt: any;
  expenseId?: string;
}
