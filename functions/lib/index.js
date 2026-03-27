"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmReschedule = exports.getRescheduleData = exports.registerTeacherAbsence = exports.manualFinancialRoutine = exports.financialRoutineDaily = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const crypto = require("crypto");
admin.initializeApp();
const db = (0, firestore_1.getFirestore)(admin.app(), 'ai-studio-00c161e8-693c-4cc9-8d3a-3e1ddae8db8e');
exports.financialRoutineDaily = functions.pubsub
    .schedule('0 8 * * *')
    .timeZone('America/Sao_Paulo')
    .onRun(async (context) => {
    await runFinancialRoutine();
});
exports.manualFinancialRoutine = functions.https.onCall(async (data, context) => {
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
        const activeStudents = studentsSnap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
        for (const student of activeStudents) {
            if (!student.courseValue || !student.dueDate)
                continue;
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
                if (dueDay > daysInMonth)
                    dueDay = daysInMonth;
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
        const { zapiInstance, zapiToken, zapiSecurityToken, remindersEnabled, reminderDaysBefore, reminderDaysBeforeCount, sendOnDue, reminderDaysAfter, reminderDaysAfterCount } = settingsSnap.data();
        if (remindersEnabled === false) {
            console.log('Reminders disabled by admin. Skipping notifications.');
            return;
        }
        if (!zapiInstance || !zapiToken) {
            console.log('Z-API credentials incomplete. Skipping notifications.');
            return;
        }
        // A helper to send the actual message via fetch
        const sendWhatsApp = async (phone, message) => {
            // clean phone number - keep only digits
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length < 10)
                return false;
            // Format for Z-API (adding country code if missing)
            const number = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
            try {
                const headers = { 'Content-Type': 'application/json' };
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
            }
            catch (err) {
                console.error('Error sending WhatsApp to', number, err);
                return false;
            }
        };
        // Helper to add days
        const addDays = (date, days) => {
            const result = new Date(date);
            result.setDate(result.getDate() + days);
            return result;
        };
        // Format utility
        const formatBRL = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
        // Load custom message templates for billing
        const templatesSnap = await db.collection('templates').where('type', 'in', ['reminder_predue', 'reminder_due', 'reminder_overdue']).get();
        const templatesMap = new Map();
        templatesSnap.docs.forEach(d => {
            const t = d.data();
            templatesMap.set(t.type, t.content);
        });
        const getReminderText = (type, studentName, amount, dueD, dueM, dueY, defaultText) => {
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
            const payment = Object.assign({ id: pDoc.id }, pDoc.data());
            console.log(`[DEBUG] Evaluating Payment: ${payment.studentName} | ${payment.amount} | Due: ${payment.dueDate}`);
            // Get the student heavily to fetch the phone number
            const studentDoc = await db.collection('students').doc(payment.studentId).get();
            if (!studentDoc.exists)
                continue;
            const studentData = studentDoc.data();
            // Do not send messages to inactive students
            if (studentData.status === 'inactive')
                continue;
            const phone = studentData.phone;
            if (!phone)
                continue; // Cannot send without phone
            // Parse payment due date
            const [dueY, dueM, dueD] = payment.dueDate.split('-').map(Number);
            const dueDateObj = new Date(dueY, dueM - 1, dueD);
            const sentHistory = payment.whatsappSent || [];
            console.log(`[DEBUG] Phone: ${phone} | CleanPhone: ${phone.replace(/\D/g, '')} | History: ${sentHistory}`);
            // Logic overrides
            let newStatus = payment.status;
            let shouldUpdate = false;
            const pushHistory = (tag) => { sentHistory.push(tag); shouldUpdate = true; };
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
                        if (success)
                            pushHistory('overdue');
                    }
                }
            }
            // 2B: Check "Due Today" (Vence Hoje)
            else if (dueDateObj.getTime() === todayZero.getTime()) {
                if (sendOnDue !== false && !sentHistory.includes('due')) {
                    const defaultMsg = `Olá, {nome}! Passando para lembrar que sua mensalidade de música (valor: {valor}) *vence hoje*.`;
                    const msg = getReminderText('reminder_due', payment.studentName, payment.amount, dueD, dueM, dueY, defaultMsg);
                    const success = await sendWhatsApp(phone, msg);
                    if (success)
                        pushHistory('due');
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
                    if (success)
                        pushHistory('pre-due');
                    else
                        console.log(`[DEBUG] Failed to send pre-due message. Invalid phone or Z-API error.`);
                }
                else {
                    console.log(`[DEBUG] Condition met but 'pre-due' already in sentHistory.`);
                }
            }
            else {
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
    }
    catch (error) {
        console.error('Error in routine:', error);
        throw error;
    }
}
// --- NEW INTELLIGENT RESCHEDULE MODULE ---
exports.registerTeacherAbsence = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Apenas usuários autenticados podem registrar faltas.');
    const { teacherId, startDate, endDate, customSlots, originUrl, reason } = data;
    if (!teacherId || !startDate || !endDate || !customSlots) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltam argumentos (teacherId, startDate, endDate, customSlots)');
    }
    console.log(`[ABSENCE] Request received: teacherId=${teacherId}, start=${startDate}, end=${endDate}`);
    // Construct dates enforcing Brazilian Timezone (UTC-3)
    const startObj = new Date(`${startDate}T00:00:00-03:00`);
    const endObj = new Date(`${endDate}T23:59:59-03:00`);
    console.log(`[ABSENCE] Querying between ${startObj.toISOString()} and ${endObj.toISOString()}`);
    const processedSlots = customSlots.map((s) => ({
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
    const affectedStudentsMap = new Map();
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
    const teacherName = ((_a = teacherDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Professor';
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
            if (studentDoc.exists && ((_b = studentDoc.data()) === null || _b === void 0 ? void 0 : _b.phone)) {
                const phone = studentDoc.data().phone.replace(/\D/g, '');
                const link = `${originUrl || 'http://localhost:5173'}/reposicao/${token}`;
                const msg = `Olá, ${studentDoc.data().name}! Informamos que o professor *${teacherName}* teve um imprevisto e sua(s) ${lostCount} aula(s) precisaram ser suspensas${reason ? ` pelo seguinte motivo: ${reason}` : ''}. Para não sair no prejuízo, por favor, clique no link seguro abaixo para escolher o melhor horário para sua reposição:\n\n🔗 ${link}`;
                console.log(`[ABSENCE] Sending ZAPI to ${phone}`);
                const url = `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
                try {
                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: phone.length <= 11 ? `55${phone}` : phone, message: msg })
                    });
                    console.log(`[ABSENCE] ZAPI status: ${resp.status}`);
                }
                catch (e) {
                    console.error('[ABSENCE] Z-API error', e);
                }
            }
            else {
                console.log(`[ABSENCE] Student ${studentId} lacks a valid phone number or document.`);
            }
        }
        else {
            console.log(`[ABSENCE] No ZAPI credentials found. Skipping MSGs.`);
        }
    }
    await batch.commit();
    console.log(`[ABSENCE] Success. Lessons changed: ${lessonsSnap.size}. Students affected: ${affectedStudentsMap.size}`);
    return { success: true, affectedLessons: lessonsSnap.size, affectedStudents: affectedStudentsMap.size };
});
exports.getRescheduleData = functions.https.onCall(async (data, context) => {
    var _a, _b;
    const { token } = data;
    if (!token)
        throw new functions.https.HttpsError('invalid-argument', 'Token missing');
    const tokensSnap = await db.collection('reschedule_tokens').where('token', '==', token).get();
    if (tokensSnap.empty)
        throw new functions.https.HttpsError('not-found', 'Token inválido');
    const tokenData = tokensSnap.docs[0].data();
    if (tokenData.status === 'used')
        throw new functions.https.HttpsError('already-exists', 'Este link já foi utilizado para reagendamento.');
    const studentDoc = await db.collection('students').doc(tokenData.studentId).get();
    const absenceDoc = await db.collection('teacher_absences').doc(tokenData.absenceId).get();
    if (!studentDoc.exists || !absenceDoc.exists)
        throw new functions.https.HttpsError('internal', 'Dados corrompidos');
    const absenceData = absenceDoc.data();
    const teacherDoc = await db.collection('teachers').doc(absenceData.teacherId).get();
    const availableSlots = (absenceData.customSlots || []).filter((s) => s.currentCount < s.maxCapacity);
    return {
        studentName: (_a = studentDoc.data()) === null || _a === void 0 ? void 0 : _a.name,
        teacherName: (_b = teacherDoc.data()) === null || _b === void 0 ? void 0 : _b.name,
        credits: tokenData.credits || 1,
        reason: absenceData.reason || '',
        availableSlots
    };
});
exports.confirmReschedule = functions.https.onCall(async (data, context) => {
    const { token, slotIds } = data;
    if (!token || !slotIds || !Array.isArray(slotIds) || slotIds.length === 0)
        throw new functions.https.HttpsError('invalid-argument', 'Missing token or slotIds');
    const txResult = await db.runTransaction(async (transaction) => {
        // 1. ALL READS FIRST
        const tokensSnap = await transaction.get(db.collection('reschedule_tokens').where('token', '==', token));
        if (tokensSnap.empty)
            throw new functions.https.HttpsError('not-found', 'Token inválido');
        const tokenDoc = tokensSnap.docs[0];
        const tokenData = tokenDoc.data();
        if (tokenData.status === 'used')
            throw new functions.https.HttpsError('already-exists', 'Link já utilizado');
        const expectedCredits = tokenData.credits || 1;
        if (slotIds.length !== expectedCredits)
            throw new functions.https.HttpsError('invalid-argument', `Você deve selecionar exatamente ${expectedCredits} horário(s).`);
        const absenceRef = db.collection('teacher_absences').doc(tokenData.absenceId);
        const absenceDoc = await transaction.get(absenceRef);
        if (!absenceDoc.exists)
            throw new functions.https.HttpsError('not-found', 'Ausência não encontrada');
        const absenceData = absenceDoc.data();
        const slots = absenceData.customSlots || [];
        const selectedSlotIndexes = [];
        for (const sid of slotIds) {
            const idx = slots.findIndex((s) => s.id === sid);
            if (idx === -1)
                throw new functions.https.HttpsError('not-found', 'Vaga não encontrada');
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
        const studentName = studentDoc.exists ? studentDoc.data().name : 'Aluno';
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
            settings: settingsSnap.exists ? settingsSnap.data() : {},
            datesSelected
        };
    });
    const { success, studentName, settings, datesSelected } = txResult;
    if (success && (settings === null || settings === void 0 ? void 0 : settings.zapiInstance) && (settings === null || settings === void 0 ? void 0 : settings.zapiToken) && (settings === null || settings === void 0 ? void 0 : settings.schoolPhone)) {
        const phone = settings.schoolPhone.replace(/\D/g, '');
        const msg = `🔔 *Aviso do Sistema Avance*\n\nO aluno *${studentName}* acaba de realizar o reagendamento automático de reposição para as seguintes datas:\n\n${datesSelected}`;
        const url = `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phone.length <= 11 ? `55${phone}` : phone, message: msg })
        }).catch(e => console.error('[CONFIRM_RESCHEDULE] Z-API Error', e));
    }
    return { success: true };
});
//# sourceMappingURL=index.js.map