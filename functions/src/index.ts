import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

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

        const url = zapiToken?.startsWith('http') ? zapiToken : `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`;
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
      return `🔔 *Aviso do Sistema Avance*\n\n${text}`;
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

// --- NEW INTELLIGENT RESCHEDULE MODULE ---

export const registerTeacherAbsence = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Apenas usuários autenticados podem registrar faltas.');
  
  const { teacherId, startDate, endDate, customSlots, originUrl, reason } = data;
  if (!teacherId || !startDate || !endDate || !customSlots) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltam argumentos (teacherId, startDate, endDate, customSlots)');
  }
  
  console.log(`[ABSENCE] Request received: teacherId=${teacherId}, start=${startDate}, end=${endDate}`);

  // Construct dates enforcing Brazilian Timezone (UTC-3)
  const startObj = new Date(`${startDate}T00:00:00-03:00`);
  const endObj = new Date(`${endDate}T23:59:59-03:00`);
  
  console.log(`[ABSENCE] Querying between ${startObj.toISOString()} and ${endObj.toISOString()}`);

  const processedSlots = customSlots.map((s: any) => ({
    id: crypto.randomUUID(),
    dateLabel: s.dateLabel,
    date: s.date,
    time: s.time,
    maxCapacity: Number(s.maxCapacity) || 1,
    currentCount: 0
  }));

  const absenceRef = await db.collection('teacher_absences').add({
    teacherId,
    startDate: admin.firestore.Timestamp.fromDate(startObj),
    endDate: admin.firestore.Timestamp.fromDate(endObj),
    customSlots: processedSlots,
    reason: reason || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const lessonsSnap = await db.collection('lessons')
    .where('teacherId', '==', teacherId)
    .where('startTime', '>=', admin.firestore.Timestamp.fromDate(startObj))
    .where('startTime', '<=', admin.firestore.Timestamp.fromDate(endObj))
    .get();

  const affectedStudentsMap = new Map<string, number>();
  const batch = db.batch();

  lessonsSnap.docs.forEach(docSnap => {
     if (docSnap.data().status === 'scheduled') {
        const sId = docSnap.data().studentId;
        affectedStudentsMap.set(sId, (affectedStudentsMap.get(sId) || 0) + 1);
        batch.update(docSnap.ref, {
           status: 'needs_reschedule',
           absenceId: absenceRef.id
        });
     }
  });

  const settingsSnap = await db.collection('settings').doc('integrations').get();
  const settings = settingsSnap.data() || {};
  
  const teacherDoc = await db.collection('teachers').doc(teacherId).get();
  const teacherName = teacherDoc.data()?.name || 'Professor';

  const templateSnap = await db.collection('templates').where('type', '==', 'reschedule').limit(1).get();
  const customTemplate = templateSnap.empty ? null : templateSnap.docs[0].data().content;

  for (const [studentId, lostCount] of Array.from(affectedStudentsMap.entries())) {
     console.log(`[ABSENCE] Processing student: ${studentId} with ${lostCount} credits`);

     const token = crypto.randomBytes(16).toString('hex');
     const tokenRef = db.collection('reschedule_tokens').doc();
     batch.set(tokenRef, {
        token,
        studentId,
        absenceId: absenceRef.id,
        status: 'pending',
        credits: lostCount,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
     });

     if (settings.zapiInstance && settings.zapiToken) {
        const studentDoc = await db.collection('students').doc(studentId).get();
        if (studentDoc.exists && studentDoc.data()?.phone) {
           const phone = studentDoc.data()!.phone.replace(/\D/g, '');
           const link = `${originUrl || 'http://localhost:5173'}/reposicao/${token}`;
           const studentName = studentDoc.data()!.name.split(' ')[0];
           
           let msg = '';
           if (customTemplate) {
             msg = customTemplate
               .replace(/{nome}/g, studentName)
               .replace(/{professor}/g, teacherName)
               .replace(/{motivo}/g, reason || '')
               .replace(/{link}/g, link);
             msg = `🔔 *Aviso do Sistema Avance*\n\n${msg}`;
           } else {
             msg = `🔔 *Aviso do Sistema Avance*\n\nOlá, ${studentDoc.data()!.name}! Informamos que o professor *${teacherName}* teve um imprevisto e sua(s) ${lostCount} aula(s) precisaram ser suspensas${reason ? ` pelo seguinte motivo: ${reason}` : ''}. Para não sair no prejuízo, por favor, clique no link seguro abaixo para escolher o melhor horário para sua reposição:\n\n🔗 ${link}`;
           }
           
           console.log(`[ABSENCE] Sending ZAPI to ${phone}`);
           const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
           const headers: any = { 'Content-Type': 'application/json' };
           if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;
           try {
             const resp = await fetch(url, {
               method: 'POST',
               headers,
               body: JSON.stringify({ phone: phone.length <= 11 ? `55${phone}` : phone, message: msg })
             });
             console.log(`[ABSENCE] ZAPI status: ${resp.status}`);
           } catch (e) { console.error('[ABSENCE] Z-API error', e); }
        } else {
           console.log(`[ABSENCE] Student ${studentId} lacks a valid phone number or document.`);
        }
     } else {
        console.log(`[ABSENCE] No ZAPI credentials found. Skipping MSGs.`);
     }
  }

  await batch.commit();
  console.log(`[ABSENCE] Success. Lessons changed: ${lessonsSnap.size}. Students affected: ${affectedStudentsMap.size}`);
  return { success: true, affectedLessons: lessonsSnap.size, affectedStudents: affectedStudentsMap.size };
});

export const getRescheduleData = functions.https.onCall(async (data, context) => {
  const { token } = data;
  if (!token) throw new functions.https.HttpsError('invalid-argument', 'Token missing');

  const tokensSnap = await db.collection('reschedule_tokens').where('token', '==', token).get();
  if (tokensSnap.empty) throw new functions.https.HttpsError('not-found', 'Token inválido');
  const tokenData = tokensSnap.docs[0].data();

  if (tokenData.status === 'used') throw new functions.https.HttpsError('already-exists', 'Este link já foi utilizado para reagendamento.');

  const studentDoc = await db.collection('students').doc(tokenData.studentId).get();
  const absenceDoc = await db.collection('teacher_absences').doc(tokenData.absenceId).get();

  if (!studentDoc.exists || !absenceDoc.exists) throw new functions.https.HttpsError('internal', 'Dados corrompidos');

  const absenceData = absenceDoc.data()!;
  const teacherDoc = await db.collection('teachers').doc(absenceData.teacherId).get();

  const availableSlots = (absenceData.customSlots || []).filter((s: any) => s.currentCount < s.maxCapacity);

  return {
    studentName: studentDoc.data()?.name,
    teacherName: teacherDoc.data()?.name,
    credits: tokenData.credits || 1,
    reason: absenceData.reason || '',
    availableSlots
  };
});

export const confirmReschedule = functions.https.onCall(async (data, context) => {
  const { token, slotIds } = data;
  if (!token || !slotIds || !Array.isArray(slotIds) || slotIds.length === 0) throw new functions.https.HttpsError('invalid-argument', 'Missing token or slotIds');

  const txResult = await db.runTransaction(async (transaction) => {
    // 1. ALL READS FIRST
    const tokensSnap = await transaction.get(db.collection('reschedule_tokens').where('token', '==', token));
    if (tokensSnap.empty) throw new functions.https.HttpsError('not-found', 'Token inválido');
    
    const tokenDoc = tokensSnap.docs[0];
    const tokenData = tokenDoc.data();
    if (tokenData.status === 'used') throw new functions.https.HttpsError('already-exists', 'Link já utilizado');

    const expectedCredits = tokenData.credits || 1;
    if (slotIds.length !== expectedCredits) throw new functions.https.HttpsError('invalid-argument', `Você deve selecionar exatamente ${expectedCredits} horário(s).`);

    const absenceRef = db.collection('teacher_absences').doc(tokenData.absenceId);
    const absenceDoc = await transaction.get(absenceRef);
    if (!absenceDoc.exists) throw new functions.https.HttpsError('not-found', 'Ausência não encontrada');
    
    const absenceData = absenceDoc.data()!;
    const slots = absenceData.customSlots || [];
    
    const selectedSlotIndexes: number[] = [];
    for (const sid of slotIds) {
      const idx = slots.findIndex((s: any) => s.id === sid);
      if (idx === -1) throw new functions.https.HttpsError('not-found', 'Vaga não encontrada');
      if (slots[idx].currentCount >= slots[idx].maxCapacity) {
        throw new functions.https.HttpsError('resource-exhausted', 'Uma das vagas escolhidas já está esgotada. Recarregue a página.');
      }
      selectedSlotIndexes.push(idx);
    }

    const lessonsQuery = db.collection('lessons')
      .where('studentId', '==', tokenData.studentId)
      .where('absenceId', '==', tokenData.absenceId)
      .where('status', '==', 'needs_reschedule');
    
    const lessonsSnap = await transaction.get(lessonsQuery);
    const studentDoc = await transaction.get(db.collection('students').doc(tokenData.studentId));
    const settingsSnap = await transaction.get(db.collection('settings').doc('integrations'));
    
    // 2. ALL WRITES AFTER ALL READS
    for (const idx of selectedSlotIndexes) {
      slots[idx].currentCount += 1;
    }
    transaction.update(absenceRef, { customSlots: slots });
    transaction.update(tokenDoc.ref, { status: 'used', usedAt: admin.firestore.FieldValue.serverTimestamp() });

    lessonsSnap.docs.forEach(lDoc => {
      transaction.update(lDoc.ref, { status: 'rescheduled' });
    });

    const baseLesson = lessonsSnap.empty ? { instrument: 'Instrumento' } : lessonsSnap.docs[0].data();

    const studentName = studentDoc.exists ? studentDoc.data()!.name : 'Aluno';
    let datesSelected = '';

    for (const idx of selectedSlotIndexes) {
      const slot = slots[idx];
      const newStart = new Date(`${slot.date}T${slot.time}:00-03:00`);
      const newEnd = new Date(newStart.getTime() + 60 * 60000);
      
      const newLessonRef = db.collection('lessons').doc();
      transaction.set(newLessonRef, {
        studentId: tokenData.studentId,
        teacherId: absenceData.teacherId,
        instrument: baseLesson.instrument || 'Instrumento',
        startTime: admin.firestore.Timestamp.fromDate(newStart),
        endTime: admin.firestore.Timestamp.fromDate(newEnd),
        status: 'scheduled',
        isMakeup: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      datesSelected += `${slot.dateLabel} às ${slot.time}; `;
    }
    
    const notifRef = db.collection('notifications').doc();
    transaction.set(notifRef, {
      title: 'Reposição Agendada',
      message: `O aluno ${studentName} agendou reposição para: ${datesSelected}`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { 
      success: true, 
      studentName,
      studentPhone: studentDoc.exists ? studentDoc.data()?.phone : null,
      settings: settingsSnap.exists ? settingsSnap.data() : {},
      datesSelected
    };
  });

  const { success, studentName, studentPhone, settings, datesSelected } = txResult as any;
  
  if (success && settings?.zapiInstance && settings?.zapiToken) {
    const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;

    const notificationPromises = [];

    // 1. Notify School Admin
    if (settings.schoolPhone) {
      const adminPhone = settings.schoolPhone.replace(/\D/g, '');
      const adminMsg = `🔔 *Aviso do Sistema Avance*\n\nO aluno *${studentName}* acaba de realizar o reagendamento automático de reposição para as seguintes datas:\n\n${datesSelected}`;
      
      const adminPromise = fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: adminPhone.length <= 11 ? `55${adminPhone}` : adminPhone, message: adminMsg })
      }).catch(e => console.error('[CONFIRM_RESCHEDULE] Z-API Error (Admin)', e));
      notificationPromises.push(adminPromise);
    }

    // 2. Notify Student
    if (studentPhone) {
      const sPhone = studentPhone.replace(/\D/g, '');
      const firstName = studentName.split(' ')[0];
      const studentMsg = `🔔 *Aviso do Sistema Avance*\n\nOlá, ${firstName}! Sua reposição foi agendada com sucesso para as seguintes datas/horários:\n\n${datesSelected}\nQualquer dúvida, estamos à disposição!`;
      
      const studentPromise = fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: sPhone.length <= 11 ? `55${sPhone}` : sPhone, message: studentMsg })
      }).catch(e => console.error('[CONFIRM_RESCHEDULE] Z-API Error (Student)', e));
      notificationPromises.push(studentPromise);
    }

    await Promise.all(notificationPromises);
  }

  return { success: true };
});

export const rejectRescheduleSlots = functions.https.onCall(async (data, context) => {
  const { token, observation } = data;
  if (!token) throw new functions.https.HttpsError('invalid-argument', 'Token missing');

  const txResult = await db.runTransaction(async (transaction) => {
    const tokensSnap = await transaction.get(db.collection('reschedule_tokens').where('token', '==', token));
    if (tokensSnap.empty) throw new functions.https.HttpsError('not-found', 'Token inválido');
    
    const tokenDoc = tokensSnap.docs[0];
    const tokenData = tokenDoc.data();
    if (tokenData.status === 'used' || tokenData.status === 'rejected_slots') {
      throw new functions.https.HttpsError('already-exists', 'Este link já foi processado.');
    }

    const absenceRef = db.collection('teacher_absences').doc(tokenData.absenceId);
    const absenceDoc = await transaction.get(absenceRef);
    if (!absenceDoc.exists) throw new functions.https.HttpsError('not-found', 'Ausência não encontrada');
    
    const studentDoc = await transaction.get(db.collection('students').doc(tokenData.studentId));
    const studentName = studentDoc.exists ? studentDoc.data()!.name : 'Aluno';

    const settingsDoc = await transaction.get(db.collection('settings').doc('integrations'));

    transaction.update(tokenDoc.ref, { 
      status: 'rejected_slots',
      studentObservation: observation || '',
      rejectedAt: admin.firestore.FieldValue.serverTimestamp() 
    });

    const notifRef = db.collection('notifications').doc();
    transaction.set(notifRef, {
      title: 'Reposição Recusada',
      message: `O aluno ${studentName} não possui disponibilidade nos horários sugeridos.${observation ? ` Obs: ${observation}` : ''}`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { 
      success: true, 
      studentName,
      settings: settingsDoc.exists ? settingsDoc.data() : null
    };
  });

  const { success, studentName, settings } = txResult as any;
  if (success && settings?.zapiInstance && settings?.zapiToken && settings?.schoolPhone) {
    const phone = settings.schoolPhone.replace(/\D/g, '');
    const msg = `🔔 *Aviso do Sistema Avance*\n\nO aluno *${studentName}* informou que NÃO tem disponibilidade nos horários de reposição sugeridos.${observation ? `\n\n*Recado do aluno:* ${observation}` : ''}\n\nAcesse o painel web na aba de Início -> Exceções para fornecer novos horários a este aluno.`;
    
    const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;
    
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: phone.length <= 11 ? `55${phone}` : phone, message: msg })
    }).catch(e => console.error('[REJECT_RESCHEDULE] Z-API Error', e));
  }

  return { success: true };
});

export const provideNewRescheduleSlots = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acesso negado');

  const { tokenId, newSlots, originUrl } = data;
  if (!tokenId || !newSlots || !Array.isArray(newSlots) || newSlots.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltam argumentos');
  }

  const processedSlots = newSlots.map((s: any) => ({
    id: crypto.randomUUID(),
    dateLabel: s.dateLabel,
    date: s.date,
    time: s.time,
    maxCapacity: Number(s.maxCapacity) || 1,
    currentCount: 0
  }));

  const txResult = await db.runTransaction(async (transaction) => {
    const tokenRef = db.collection('reschedule_tokens').doc(tokenId);
    const tokenDoc = await transaction.get(tokenRef);
    if (!tokenDoc.exists) throw new functions.https.HttpsError('not-found', 'Token não encontrado');
    
    const tokenData = tokenDoc.data()!;
    if (tokenData.status !== 'rejected_slots') {
      throw new functions.https.HttpsError('failed-precondition', 'Este token não está aguardando novos horários.');
    }

    const absenceRef = db.collection('teacher_absences').doc(tokenData.absenceId);
    const absenceDoc = await transaction.get(absenceRef);
    if (!absenceDoc.exists) throw new functions.https.HttpsError('not-found', 'Ausência não encontrada');

    const absenceData = absenceDoc.data()!;
    const updatedSlots = [...(absenceData.customSlots || []), ...processedSlots];

    const studentDoc = await transaction.get(db.collection('students').doc(tokenData.studentId));
    const teacherDoc = await transaction.get(db.collection('teachers').doc(absenceData.teacherId));
    const settingsDoc = await transaction.get(db.collection('settings').doc('integrations'));

    transaction.update(absenceRef, { customSlots: updatedSlots });
    transaction.update(tokenRef, { status: 'pending', rePushedAt: admin.firestore.FieldValue.serverTimestamp() });

    return {
      success: true,
      studentData: studentDoc.data(),
      teacherName: teacherDoc.exists ? teacherDoc.data()!.name : 'Professor',
      settings: settingsDoc.exists ? settingsDoc.data() : null,
      token: tokenData.token
    };
  });

  const { success, studentData, teacherName, settings, token } = txResult as any;

  if (success && settings?.zapiInstance && settings?.zapiToken && studentData?.phone) {
    const phone = studentData.phone.replace(/\D/g, '');
    const link = `${originUrl || 'http://localhost:5173'}/reposicao/${token}`;
    const msg = `🔔 *Aviso do Sistema Avance*\n\nOlá, ${studentData.name}! O professor *${teacherName}* disponibilizou novos horários para a sua reposição.\n\nPor favor, acesse o link abaixo para escolher o seu horário:\n🔗 ${link}`;
    
    const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: phone.length <= 11 ? `55${phone}` : phone, message: msg })
    }).catch(e => console.error('[NOVO_HORARIO] Z-API Error', e));
  }

  return { success: true };
});

export const createStudentUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Apenas usuários logados podem criar credenciais didáticas.');
  }

  // Optional: check if caller is an admin
  const callerSnap = await db.collection('users').doc(context.auth.uid).get();
  if (callerSnap.exists && callerSnap.data()?.role !== 'admin' && context.auth.token.email !== 'lamartinecezar3@gmail.com') {
    throw new functions.https.HttpsError('permission-denied', 'Somente administradores podem criar novos acessos.');
  }

  const { email, password, displayName, studentId } = data;
  if (!email || !password || !studentId) {
    throw new functions.https.HttpsError('invalid-argument', 'Parâmetros incompletos para a geração de credenciais.');
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    });

    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName,
      role: 'student',
      studentId,
      mustChangePassword: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('students').doc(studentId).update({ authUid: userRecord.uid });

    return { success: true, uid: userRecord.uid };
  } catch (error: any) {
    console.error('Erro ao gerar Auth para Aluno', error);
    // If the email already exists, Firebase throws 'auth/email-already-exists'. Handle gracefully?
    throw new functions.https.HttpsError('internal', error.message || 'Erro ao criar conta no Firebase Auth');
  }
});

export const requestPasswordResetWhatsApp = functions.https.onCall(async (data, context) => {
  const { cpf } = data;
  if (!cpf || cpf.length < 11) {
    throw new functions.https.HttpsError('invalid-argument', 'CPF inválido fornecido.');
  }

  const studentsSnap = await db.collection('students').where('cpf', '==', cpf).limit(1).get();
  if (studentsSnap.empty) {
    throw new functions.https.HttpsError('not-found', 'Nenhum aluno encontrado com este CPF.');
  }

  const studentDoc = studentsSnap.docs[0];
  const studentData = studentDoc.data();

  if (!studentData.authUid) {
    throw new functions.https.HttpsError('failed-precondition', 'Este aluno não possui uma conta de acesso configurada.');
  }

  if (!studentData.phone) {
    throw new functions.https.HttpsError('failed-precondition', 'Este aluno não possui telefone cadastrado para receber a senha.');
  }

  const randNum = Math.floor(1000 + Math.random() * 9000);
  const tempPassword = `Avance#${randNum}`;

  try {
    // 1. Update Password in Firebase Auth
    await admin.auth().updateUser(studentData.authUid, { password: tempPassword });

    // 2. Force password change on next login
    await db.collection('users').doc(studentData.authUid).update({
      mustChangePassword: true
    });

    // 3. Send WhatsApp via Z-API
    const settingsSnap = await db.collection('settings').doc('integrations').get();
    if (!settingsSnap.exists) {
      throw new functions.https.HttpsError('internal', 'Configuração de WhatsApp não encontrada no sistema.');
    }

    const { zapiInstance, zapiToken, zapiSecurityToken } = settingsSnap.data() as any;
    if (!zapiInstance || !zapiToken) {
      throw new functions.https.HttpsError('internal', 'Credenciais do WhatsApp estão incompletas.');
    }

    const cleanPhone = studentData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      throw new functions.https.HttpsError('invalid-argument', 'Telefone cadastrado parece estar incorreto.');
    }

    const number = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const firstName = studentData.name.split(' ')[0];
    const msg = `🔔 *Aviso do Sistema Avance*\n\nOlá, ${firstName}! Recebemos um pedido de recuperação da sua senha.\n\nSua nova senha provisória é:\n*${tempPassword}*\n\nPor motivos de segurança, o sistema pedirá que você crie uma nova senha de sua escolha assim que realizar o login com esta senha provisória.`;

    const url = zapiToken?.startsWith('http') ? zapiToken : `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (zapiSecurityToken) headers['Client-Token'] = zapiSecurityToken;

    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: number, message: msg })
    });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao processar requestPasswordResetWhatsApp', error);
    throw new functions.https.HttpsError('internal', error.message || 'Falha ao processar a troca de senha.');
  }
});

export const notifyStudentEvaluation = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acesso negado');

  const { evaluationId, originUrl } = data;
  if (!evaluationId) throw new functions.https.HttpsError('invalid-argument', 'evaluationId é obrigatório');

  const evalDoc = await db.collection('evaluations').doc(evaluationId).get();
  if (!evalDoc.exists) throw new functions.https.HttpsError('not-found', 'Avaliação não encontrada');

  const evalData = evalDoc.data()!;
  
  const studentDoc = await db.collection('students').doc(evalData.studentId).get();
  if (!studentDoc.exists) throw new functions.https.HttpsError('not-found', 'Aluno não encontrado');
  
  const studentData = studentDoc.data()!;
  if (!studentData.phone) return { success: false, reason: 'Aluno sem telefone' };

  // Get templates
  const templateSnap = await db.collection('templates').where('type', '==', 'evaluation').limit(1).get();
  const customTemplate = templateSnap.empty ? null : templateSnap.docs[0].data().content;

  // Settings
  const settingsSnap = await db.collection('settings').doc('integrations').get();
  const settings = settingsSnap.exists ? settingsSnap.data() : null;

  if (settings?.zapiInstance && settings?.zapiToken) {
    const phone = studentData.phone.replace(/\D/g, '');
    const link = `${originUrl || 'https://sistema-avance.web.app'}`; // Standard dashboard URL
    const studentName = studentData.name.split(' ')[0];
    const teacherName = evalData.teacherName || 'Professor';
    
    let msg = '';
    if (customTemplate) {
      msg = customTemplate
        .replace(/{nome}/g, studentName)
        .replace(/{professor}/g, teacherName)
        .replace(/{link}/g, link);
      msg = `🔔 *Aviso do Sistema Avance*\n\n${msg}`;
    } else {
      msg = `🔔 *Aviso do Sistema Avance*\n\nOlá, ${studentName}! O professor *${teacherName}* acabou de liberar o seu novo Boletim de Avaliação Niveladora.\n\nAcesse o Portal do Aluno para conferir as notas e o feedback do professor:\n🔗 ${link}`;
    }

    const number = phone.length <= 11 ? `55${phone}` : phone;
    const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;
    
    try {
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: number, message: msg })
      });
      return { success: true };
    } catch (e) {
      console.error('[EVAL_NOTIFY] Z-API Error', e);
      return { success: false, reason: 'Falha na Z-API' };
    }
  }

  return { success: false, reason: 'Z-API não configurada' };
});

async function runPedagogicalRoutine() {
  try {
    const settingsDoc = await db.collection('settings').doc('integrations').get();
    if (!settingsDoc.exists) {
      console.log('[PEDAGOGICAL] Configurações não encontradas.');
      return;
    }

    const settings = settingsDoc.data();
    if (!settings?.zapiInstance || !settings?.zapiToken) {
      console.log('[PEDAGOGICAL] Z-API não configurada.');
      return;
    }

    const cycleDays = settings.evaluationCycleDays || 90;
    const notifyDaysBefore = settings.notifyTeacherDaysBefore || 1;

    // We check for lessons that happen tomorrow (if notifyDaysBefore = 1), zeroed out.
    const today = new Date();
    // Use UTC-3 for Brazil
    const brlOffset = -3 * 60; // offset in minutes
    const nowUtc = new Date(today.getTime() + today.getTimezoneOffset() * 60000);
    const brlTime = new Date(nowUtc.getTime() + brlOffset * 60000);
    
    // Calculate the target day
    const targetDay = new Date(brlTime);
    targetDay.setDate(targetDay.getDate() + notifyDaysBefore);
    targetDay.setHours(0, 0, 0, 0);

    const targetDayEnd = new Date(targetDay);
    targetDayEnd.setHours(23, 59, 59, 999);

    console.log(`[PEDAGOGICAL] Varrendo alunos. Data alvo das aulas: ${targetDay.toISOString()}`);

    const studentsSnap = await db.collection('students').where('status', '==', 'active').get();
    
    // Fetch custom template for the teacher if available
    const templateSnap = await db.collection('templates').where('type', '==', 'pedagogic_reminder').where('isAutomatic', '==', true).limit(1).get();
    const customTemplate = templateSnap.empty ? null : templateSnap.docs[0].data();

    // For each student, check if they are due
    for (const sDoc of studentsSnap.docs) {
      const student = { id: sDoc.id, ...sDoc.data() } as any;

      const baseDateStr = student.lastEvaluationDate || (student.createdAt?.toDate ? student.createdAt.toDate().toISOString().split('T')[0] : null);
      if (!baseDateStr) continue;

      const baseDate = new Date(baseDateStr + 'T12:00:00'); // No timezone trickery, roughly midday.
      // Assuming today is basically BRL time midday
      const diffTime = Math.abs(brlTime.getTime() - baseDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= cycleDays) {
        // Due! Let's see if they have a lesson in `targetDay`
        const lessonsSnap = await db.collection('lessons')
          .where('studentId', '==', student.id)
          .where('status', '==', 'scheduled')
          .where('startTime', '>=', admin.firestore.Timestamp.fromDate(targetDay))
          .where('startTime', '<=', admin.firestore.Timestamp.fromDate(targetDayEnd))
          .get();

        if (lessonsSnap.empty) continue;

        // Has lesson!
        const lesson = lessonsSnap.docs[0].data();
        const teacherId = lesson.teacherId;

        const teacherDoc = await db.collection('teachers').doc(teacherId).get();
        if (!teacherDoc.exists) continue;
        const teacher = teacherDoc.data() as any;

        const teacherFirstName = teacher.name.split(' ')[0];
        const studentFirstName = student.name.split(' ')[0];

        // Format message
        let msg = '';
        if (customTemplate) {
          msg = customTemplate.content
            .replace(/{aluno}/g, studentFirstName)
            .replace(/{professor}/g, teacherFirstName)
            .replace(/{dias}/g, diffDays.toString());
          msg = `🔔 *Aviso do Sistema Avance*\n\n${msg}`;
        } else {
          msg = `🔔 *Aviso do Sistema Avance*\n\nOlá, Prof(a). *${teacherFirstName}*! Tudo bem?\n\nPassando para lembrar que amanhã você tem aula agendada com o aluno *${studentFirstName}*. O ciclo pedagógico deste aluno está *fechado* (já se passaram ${diffDays} dias desde a marcação anterior).\n\nQue tal focar em avaliar o nível de progressão dele na aula de amanhã e registrar um Novo Boletim no sistema? 😉`;
        }

        const teacherHasPhone = !!teacher.phone;
        let numberToSend = teacherHasPhone ? teacher.phone.replace(/\D/g, '') : (settings.schoolPhone ? settings.schoolPhone.replace(/\D/g, '') : null);

        if (!numberToSend) {
          console.log(`[PEDAGOGICAL] Ninguém para avisar sobre ${studentFirstName}. Prof e Escola sem WhatsApp configurado.`);
          continue;
        }

        if (!teacherHasPhone && numberToSend === settings.schoolPhone?.replace(/\D/g, '')) {
            msg = `🔔 *Aviso Interno Pedagógico*\n\nAdmin, o professor *${teacherFirstName}* tem aula amanhã com o aluno *${studentFirstName}* e precisa realizar a *Avaliação de Nivelamento* atrasada (ciclo fechou há ${diffDays} dias). O professor em questão não possui telefone cadastrado!`;
        }

        const formattedNumber = numberToSend.length <= 11 ? `55${numberToSend}` : numberToSend;
        const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
        const headers: any = { 'Content-Type': 'application/json' };
        if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;

        try {
          await fetch(url, { method: 'POST', headers, body: JSON.stringify({ phone: formattedNumber, message: msg }) });
          console.log(`[PEDAGOGICAL] Avaliação sugerida de ${studentFirstName} enviada para ${formattedNumber}`);
        } catch (e) {
          console.error(`[PEDAGOGICAL] Falha no disparo a ${formattedNumber}:`, e);
        }
      }
    }

  } catch (err) {
    console.error('[PEDAGOGICAL_ROUTINE] Error:', err);
  }
}

export const pedagogicalRoutineDaily = functions.pubsub.schedule('0 9 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
  await runPedagogicalRoutine();
});

export const manualPedagogicalRoutine = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Apenas usuários autenticados podem rodar isso.');
    }
    await runPedagogicalRoutine();
    return { success: true, message: 'Varredura pedagógica executada.' };
  } catch (err: any) {
    throw new functions.https.HttpsError('internal', err.message);
  }
});

export const onUserDeleted = functions.firestore.document('users/{userId}').onDelete(async (snap, context) => {
  const uid = context.params.userId;
  try {
    await admin.auth().deleteUser(uid);
    console.log(`[AUTH CLEANUP] Credencial do Auth deletada para o usuário ${uid}`);
  } catch (error: any) {
    console.error(`[AUTH CLEANUP] Erro ao deletar o Auth do usuário ${uid}:`, error);
  }
});

export const notifyNewMaterial = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acesso negado');

  const { materialId, studentIds, originUrl } = data;
  if (!materialId || !studentIds || !Array.isArray(studentIds)) throw new functions.https.HttpsError('invalid-argument', 'Parâmetros inválidos');

  const materialDoc = await db.collection('materials').doc(materialId).get();
  if (!materialDoc.exists) throw new functions.https.HttpsError('not-found', 'Material não encontrado');

  const materialData = materialDoc.data()!;
  
  // Settings
  const settingsSnap = await db.collection('settings').doc('integrations').get();
  const settings = settingsSnap.exists ? settingsSnap.data() : null;
  if (!settings?.zapiInstance || !settings?.zapiToken) {
    return { success: false, reason: 'Z-API não configurada' };
  }

  // Get templates
  const templateSnap = await db.collection('templates').where('type', '==', 'material_added').limit(1).get();
  let customTemplate = null;
  
  if (!templateSnap.empty) {
    const templateData = templateSnap.docs[0].data();
    if (templateData.isAutomatic === false) {
      return { success: false, reason: 'Envio automático de material desativado pelo administrador' };
    }
    customTemplate = templateData.content;
  }

  const teacherName = materialData.teacherName || 'Professor';
  const link = `${originUrl || 'https://sistema-avance.web.app'}`;

  const studentPromises = studentIds.map(async (studentId: string) => {
    const studentDoc = await db.collection('students').doc(studentId).get();
    if (!studentDoc.exists) return;
    
    const studentData = studentDoc.data()!;
    if (!studentData.phone) return;

    const phone = studentData.phone.replace(/\D/g, '');
    const studentName = studentData.name.split(' ')[0];

    let msg = '';
    if (customTemplate) {
      msg = customTemplate
        .replace(/{aluno}/g, studentName)
        .replace(/{nome}/g, studentName)
        .replace(/{professor}/g, teacherName)
        .replace(/{material}/g, materialData.title)
        .replace(/{link}/g, link);
      msg = `🔔 *Aviso do Sistema Avance*\n\n${msg}`;
    } else {
      msg = `🔔 *Aviso do Sistema Avance*\n\nOlá, ${studentName}! O professor *${teacherName}* acabou de compartilhar um novo material didático com você: *${materialData.title}*.\n\nAcesse o Portal do Aluno para conferir e baixar:\n🔗 ${link}`;
    }

    const number = phone.length <= 11 ? `55${phone}` : phone;
    const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;

    const payload = {
      instanceName: settings.zapiInstance, // Always inject instanceName just in case custom motor expects it
      phone: number,
      message: msg
    };

    console.log(`[MATERIAL_NOTIFY] Dispatching to: ${url}`);
    console.log(`[MATERIAL_NOTIFY] Payload Number: ${number}`);

    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      console.log(`[MATERIAL_NOTIFY] Response Status: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log(`[MATERIAL_NOTIFY] Response Text: ${text}`);
    } catch (e) {
      console.error('[MATERIAL_NOTIFY] Fetch Error', e);
    }
  });

  await Promise.all(studentPromises);
  return { success: true };
});

export const notifyTrialLesson = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acesso negado');

  const { lessonId } = data;
  if (!lessonId) throw new functions.https.HttpsError('invalid-argument', 'lessonId é obrigatório');

  const lessonDoc = await db.collection('lessons').doc(lessonId).get();
  if (!lessonDoc.exists) throw new functions.https.HttpsError('not-found', 'Aula não encontrada');

  const lessonData = lessonDoc.data()!;
  if (!lessonData.isTrial) return { success: false, reason: 'Não é aula teste' };

  // Settings
  const settingsSnap = await db.collection('settings').doc('integrations').get();
  const settings = settingsSnap.exists ? settingsSnap.data() : null;
  if (!settings?.zapiInstance || !settings?.zapiToken) {
    return { success: false, reason: 'Z-API não configurada' };
  }

  const teacherDoc = await db.collection('teachers').doc(lessonData.teacherId).get();
  if (!teacherDoc.exists) throw new functions.https.HttpsError('not-found', 'Professor não encontrado');
  
  const teacherData = teacherDoc.data()!;
  const teacherName = teacherData.name;
  const teacherPhone = teacherData.phone;
  
  const studentName = lessonData.studentName || 'Prospecto';
  const studentPhone = lessonData.studentPhone;
  const instrument = lessonData.instrument || 'Instrumento';
  
  // Format Date and Time
  const lessonDate = lessonData.startTime.toDate();
  const dateStr = lessonDate.toLocaleDateString('pt-BR');
  const timeStr = lessonDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const notificationPromises = [];
  const url = settings.zapiToken?.startsWith('http') ? settings.zapiToken : `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
  const headers: any = { 'Content-Type': 'application/json' };
  if (settings.zapiSecurityToken) headers['Client-Token'] = settings.zapiSecurityToken;

  // Notify Teacher
  if (teacherPhone) {
    const tPhone = teacherPhone.replace(/\D/g, '');
    const tNum = tPhone.length <= 11 ? `55${tPhone}` : tPhone;
    const msgTeacher = `🔔 *Aviso do Sistema Avance*\n\nOlá, *${teacherName.split(' ')[0]}*! Uma nova *Aula Teste* de ${instrument} foi agendada para você com o(a) aluno(a) prospecto *${studentName}* no dia *${dateStr} às ${timeStr}*.`;
    
    const promise = fetch(url, { method: 'POST', headers, body: JSON.stringify({ phone: tNum, message: msgTeacher }) }).catch(e => console.error(e));
    notificationPromises.push(promise);
  }

  // Notify Student
  if (studentPhone) {
    const sPhone = studentPhone.replace(/\D/g, '');
    const sNum = sPhone.length <= 11 ? `55${sPhone}` : sPhone;
    const msgStudent = `🔔 *Aviso do Sistema Avance*\n\nOlá, ${studentName.split(' ')[0]}! Sua aula experimental de *${instrument}* foi confirmada para o dia *${dateStr} às ${timeStr}* com o professor *${teacherName}*.\n\nQualquer dúvida, estamos à disposição!`;
    
    const promise = fetch(url, { method: 'POST', headers, body: JSON.stringify({ instanceName: settings.zapiInstance, phone: sNum, message: msgStudent }) }).catch(e => console.error(e));
    notificationPromises.push(promise);
  }

  await Promise.all(notificationPromises);
  return { success: true };
});
