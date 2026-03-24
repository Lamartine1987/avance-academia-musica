import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

admin.initializeApp();
const db = getFirestore(admin.app(), 'ai-studio-00c161e8-693c-4cc9-8d3a-3e1ddae8db8e');

export const financialRoutineDaily = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('America/Sao_Paulo')
  .onRun(async (context: any) => {
    await runFinancialRoutine();
  });

export const manualFinancialRoutine = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário precisa estar autenticado.');
  }
  await runFinancialRoutine();
  return { success: true, message: 'Rotina financeira executada com sucesso.' };
});

async function runFinancialRoutine() {
  console.log('Starting financial routine...');
  
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentYear = today.getFullYear();
  
  try {
    // 1. GENERATE PAYMENTS FOR ACTIVE STUDENTS
    const studentsSnap = await db.collection('students').where('status', '==', 'active').get();
    const activeStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    for (const student of activeStudents) {
      if (!student.courseValue || !student.dueDate) continue;

      // Check if payment already exists for this month/year
      const paymentQuery = await db.collection('payments')
        .where('studentId', '==', student.id)
        .where('month', '==', currentMonth)
        .where('year', '==', currentYear)
        .limit(1).get();

      if (paymentQuery.empty) {
        // Create payment
        // Construct due date for this month
        let dueDay = student.dueDate;
        
        // Handle max days in month
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        if (dueDay > daysInMonth) dueDay = daysInMonth;

        const dueDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
        
        await db.collection('payments').add({
          studentId: student.id,
          studentName: student.name,
          amount: student.courseValue,
          dueDate: dueDateStr,
          month: currentMonth,
          year: currentYear,
          status: 'pending',
          whatsappSent: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Generated payment for student ${student.name} (Due: ${dueDateStr})`);
      }
    }

    // 2. SEND WHATSAPP NOTIFICATIONS
    const settingsSnap = await db.collection('settings').doc('integrations').get();
    if (!settingsSnap.exists) {
      console.log('Z-API credentials not configured. Skipping notifications.');
      return;
    }

    const { 
      zapiInstance, zapiToken, zapiSecurityToken,
      remindersEnabled, reminderDaysBefore, reminderDaysBeforeCount,
      sendOnDue, reminderDaysAfter, reminderDaysAfterCount
    } = settingsSnap.data() as any;
    
    if (remindersEnabled === false) {
      console.log('Reminders disabled by admin. Skipping notifications.');
      return;
    }
    
    if (!zapiInstance || !zapiToken) {
      console.log('Z-API credentials incomplete. Skipping notifications.');
      return;
    }

    // A helper to send the actual message via fetch
    const sendWhatsApp = async (phone: string, message: string) => {
      // clean phone number - keep only digits
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 10) return false;

      // Format for Z-API (adding country code if missing)
      const number = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
      
      try {
        const headers: any = { 'Content-Type': 'application/json' };
        if (zapiSecurityToken) {
          headers['Client-Token'] = zapiSecurityToken;
        }

        const url = `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`;
        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            phone: number,
            message: message
          })
        });
        const data = await response.json();
        return data.id || data.messageId ? true : false;
      } catch (err) {
        console.error('Error sending WhatsApp to', number, err);
        return false;
      }
    };

    // Helper to add days
    const addDays = (date: Date, days: number) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    };

    // Format utility
    const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    // Load custom message templates for billing
    const templatesSnap = await db.collection('templates').where('type', 'in', ['reminder_predue', 'reminder_due', 'reminder_overdue']).get();
    const templatesMap = new Map();
    templatesSnap.docs.forEach(d => {
       const t = d.data();
       templatesMap.set(t.type, t.content);
    });

    const getReminderText = (type: string, studentName: string, amount: number, dueD: number, dueM: number, dueY: number, defaultText: string) => {
      let text = templatesMap.has(type) ? templatesMap.get(type) : defaultText;
      const dueDateStr = `${String(dueD).padStart(2, '0')}/${String(dueM).padStart(2, '0')}/${dueY}`;
      
      text = text.replace(/{nome}/g, studentName.split(' ')[0]);
      text = text.replace(/{valor}/g, formatBRL(amount));
      text = text.replace(/{vencimento}/g, dueDateStr);
      return text;
    };

    // Evaluate pending payments
    const pendingSnaps = await db.collection('payments').where('status', 'in', ['pending', 'overdue']).get();
    
    // Create zeroed time references for date comparisons
    const todayZero = new Date(currentYear, currentMonth - 1, today.getDate());
    
    const _beforeCount = reminderDaysBeforeCount || 3;
    const targetBefore = addDays(todayZero, _beforeCount);

    const _afterCount = reminderDaysAfterCount || 1;
    const targetAfter = addDays(todayZero, -_afterCount);

    console.log(`[DEBUG] Date Bounds: todayZero=${todayZero.toISOString()} | targetBefore=${targetBefore.toISOString()} | targetAfter=${targetAfter.toISOString()}`);

    for (const pDoc of pendingSnaps.docs) {
      const payment = { id: pDoc.id, ...pDoc.data() } as any;
      console.log(`[DEBUG] Evaluating Payment: ${payment.studentName} | ${payment.amount} | Due: ${payment.dueDate}`);
      
      // Get the student heavily to fetch the phone number
      const studentDoc = await db.collection('students').doc(payment.studentId).get();
      if (!studentDoc.exists) continue;
      
      const studentData = studentDoc.data() as any;
      
      // Do not send messages to inactive students
      if (studentData.status === 'inactive') continue;

      const phone = studentData.phone;
      if (!phone) continue; // Cannot send without phone

      // Parse payment due date
      const [dueY, dueM, dueD] = payment.dueDate.split('-').map(Number);
      const dueDateObj = new Date(dueY, dueM - 1, dueD);
      const sentHistory = payment.whatsappSent || [];
      
      console.log(`[DEBUG] Phone: ${phone} | CleanPhone: ${phone.replace(/\D/g, '')} | History: ${sentHistory}`);

      // Logic overrides
      let newStatus = payment.status;
      let shouldUpdate = false;
      const pushHistory = (tag: string) => { sentHistory.push(tag); shouldUpdate = true; };

      // 2A: Check "Overdue" (Atrasado)
      if (dueDateObj < todayZero) {
        if (newStatus !== 'overdue') {
          newStatus = 'overdue';
          shouldUpdate = true;
        }

        if (reminderDaysAfter !== false && dueDateObj.getTime() === targetAfter.getTime()) {
          if (!sentHistory.includes('overdue')) {
            const defaultMsg = `Olá, {nome}! Notamos que sua mensalidade de música (valor: {valor}) está *pendente* conosco. Caso já tenha efetuado o pagamento, desconsidere esta mensagem.`;
            const msg = getReminderText('reminder_overdue', payment.studentName, payment.amount, dueD, dueM, dueY, defaultMsg);
            const success = await sendWhatsApp(phone, msg);
            if (success) pushHistory('overdue');
          }
        }
      } 
      // 2B: Check "Due Today" (Vence Hoje)
      else if (dueDateObj.getTime() === todayZero.getTime()) {
        if (sendOnDue !== false && !sentHistory.includes('due')) {
          const defaultMsg = `Olá, {nome}! Passando para lembrar que sua mensalidade de música (valor: {valor}) *vence hoje*.`;
          const msg = getReminderText('reminder_due', payment.studentName, payment.amount, dueD, dueM, dueY, defaultMsg);
          const success = await sendWhatsApp(phone, msg);
          if (success) pushHistory('due');
        }
      } 
      // 2C: Check "Pre Due" (Aviso Prévio)
      else if (reminderDaysBefore !== false && dueDateObj.getTime() === targetBefore.getTime()) {
        console.log(`[DEBUG] Math matches Pre Due (3 days) condition for ${payment.studentName}!`);
        if (!sentHistory.includes('pre-due')) {
          console.log(`[DEBUG] Triggering WhatsApp Z-API pre-due message...`);
          const defaultMsg = `Olá, {nome}! Passando para avisar que sua mensalidade de música (valor: {valor}) vence no próximo dia *{vencimento}*.`;
          const msg = getReminderText('reminder_predue', payment.studentName, payment.amount, dueD, dueM, dueY, defaultMsg);
          const success = await sendWhatsApp(phone, msg);
          if (success) pushHistory('pre-due');
          else console.log(`[DEBUG] Failed to send pre-due message. Invalid phone or Z-API error.`);
        } else {
          console.log(`[DEBUG] Condition met but 'pre-due' already in sentHistory.`);
        }
      } else {
        console.log(`[DEBUG] No conditions matched. dueDateObj=${dueDateObj.getTime()} | targetBefore=${targetBefore.getTime()}`);
      }

      // Final Check
      if (shouldUpdate) {
        await pDoc.ref.update({
          status: newStatus,
          whatsappSent: sentHistory
        });
      }
    }

    console.log('Financial routine completed.');
  } catch (error) {
    console.error('Error in routine:', error);
    throw error;
  }
}
