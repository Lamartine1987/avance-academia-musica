import html2pdf from 'html2pdf.js';
import { Student, UserProfile, DocumentRequest } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const getFormattedDate = (timestampOrString: any) => {
  try {
    const date = typeof timestampOrString === 'string' ? new Date(timestampOrString) : (timestampOrString?.toDate ? timestampOrString.toDate() : new Date());
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  }
};

const isMinor = (student: Student) => {
  if (!student.birthDate) return false;
  const diff = new Date().getTime() - new Date(student.birthDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)) < 18;
};

export const generateSignedContractPDF = async (student: Student, schoolSettings: any, profile: UserProfile): Promise<Blob> => {
  const mainCourse = student.enrollments && student.enrollments.length > 0 ? student.enrollments[0] : null;
  const frequency = mainCourse?.schedule ? mainCourse.schedule.length + ' vez(es) por semana' : '1 vez(es) por semana';
  const duration = mainCourse?.duration ? mainCourse.duration + ' minutos' : '60 minutos';
  const formatType = student.classType === 'individual' ? 'FORMATO INDIVIDUAL' : 'EM GRUPO';
  const course = mainCourse ? mainCourse.instrument : 'Curso de Música';
  const value = student.courseValue ? Number(student.courseValue).toFixed(2).replace('.', ',') : '0,00';
  const dueDay = student.dueDate || 10;
  const dueMonth = getFormattedDate(student.createdAt).split(' ').slice(2).join(' ');

  let rawTemplate = schoolSettings?.contractTemplate || `
<p><strong>CLÁUSULA PRIMEIRA</strong> - O objeto do presente instrumento é a prestação, pela CONTRATADA, em favor do(a) CONTRATANTE, dos serviços de ensino de música (CNAE 8592-9/03), por meio de aulas de música e prática de instrumentos na modalidade <strong>{{curso}}</strong>.</p>
<p style="margin-left: 20px;"><strong>Parágrafo 1º</strong> - O curso compreende aulas teóricas e práticas, ministradas por professores qualificados e sempre que necessário, a critério dos professores, a utilização de equipamentos de som e imagem. <strong>AS AULAS SERÃO EM {{formato}}.</strong></p>
<p style="margin-left: 20px;"><strong>Parágrafo 2º</strong> - As aulas são intransferíveis, ministradas <strong>{{frequencia}}</strong>, com duração de <strong>{{duracao}}</strong> em dia e horário fixo, escolhido no ato da matrícula de acordo com a disponibilidade de horário do curso contratado.</p>
<p><strong>CLÁUSULA SEGUNDA</strong> - Caso o(a) CONTRATANTE não compareça a aula, computar-se-á a aula no pacote mensal do(a) CONTRATANTE, salvo nos casos de enfermidade ou internação hospitalar, devidamente comprovadas por atestado médico. <strong>A tolerância para atraso do aluno será de 20 minutos.</strong></p>
<p style="margin-left: 20px;"><strong>Parágrafo 1º</strong> - Deveres do Contratante(aluno): comportar-se com civilidade, observando os preceitos de disciplina e boa educação, respeito aos colegas e professores, sendo passível de rescisão deste contrato o comportamento inadequado do aluno. Não é permitida a entrada de acompanhantes, crianças (dependentes) e ou animais domésticos em sala de aula (exceto em casos de alunos portadores de necessidades especiais) <strong>NÃO É PERMITIDO O CONSUMO DE BEBIDAS ALCOÓLICAS E ALIMENTOS NAS SALAS DE AULA E NAS DEPENDÊNCIAS DA ESCOLA.</strong></p>
<p style="margin-left: 20px; text-transform: uppercase;"><strong>Parágrafo 2º - Todo dano ou prejuízo causado pelo aluno na estrutura física deste estabelecimento de ensino, os pais ou responsáveis deverão ressarcir as despesas à Contratada, no prazo de 10 dias.</strong></p>
<p style="margin-left: 20px;"><strong>Parágrafo 3º</strong> - Durante o período de recesso (datas disponíveis no calendário da Escola) essas aulas não serão repostas. Aulas que porventura caiam em feriados <strong>(Nacional, Estadual e Municipal), não serão repostas, assim como em datas especiais: Dia do Professor</strong>.</p>
<p><strong>CLÁUSULA TERCEIRA</strong> - Em contrapartida aos serviços prestados, o(a) CONTRATANTE pagará em favor da CONTRATADA o valor certo e ajustado de <strong>R$ {{valor}}</strong>, o qual será pago mensalmente igual e sucessivamente, sendo que a primeira vencerá no dia <strong>{{vencimento}}</strong>.</p>
<p style="margin-left: 20px;"><strong>Parágrafo 1º</strong> - No caso de inadimplência de quaisquer das parcelas, haverá a incidência de multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês ou fração sobre o valor vencido e não pago.</p>
<p style="margin-left: 20px;"><strong>Parágrafo 2º</strong> - No caso de inadimplência por mais de 20(vinte) dias, o pacote do(a) CONTRATANTE será suspenso até a liquidação das pendências financeiras.</p>
<p style="margin-left: 20px;"><strong>Parágrafo 3º</strong> - O contratante (responsável), deve fornecer um número para contato e e-mail atualizados. Autoriza também receber através do aplicativo WhatsApp e do e-mail, avisos e cobranças.</p>
<p><strong>CLÁUSULA QUARTA</strong> - Pelo presente instrumento, o(a) CONTRATANTE cede em favor da CONTRATADA os direitos de utilização de sua imagem e voz em eventos da escola.</p>
<p><strong>CLÁUSULA QUINTA</strong> - O(A) CONTRATANTE poderá optar pela resilição do presente contrato antes do seu término, devendo, para tanto, comunicar tal intenção à CONTRATADA com antecedência mínima de 30 (trinta) dias.</p>
<p><strong>CLÁUSULA SEXTA</strong> - As partes elegem o Foro da Comarca <strong>Caruaru</strong>, como o único competente para dirimir toda e qualquer dúvida. E assim, por estarem justas e contratadas, as partes assinam o presente em duas vias.</p>
  `;

  let text = rawTemplate;
  text = text.replace(/\{\{curso\}\}/g, course);
  text = text.replace(/\{\{formato\}\}/g, formatType);
  text = text.replace(/\{\{frequencia\}\}/g, frequency);
  text = text.replace(/\{\{duracao\}\}/g, duration);
  text = text.replace(/\{\{valor\}\}/g, value);
  text = text.replace(/\{\{vencimento\}\}/g, dueDay + ' ' + dueMonth);
  text = text.replace(/&nbsp;/g, ' ');

  const minor = isMinor(student);

  // Html layout identical to ContractViewer
  const htmlContent = `
    <div style="padding: 40px; font-family: serif; color: black; line-height: 1.6; font-size: 12px; background: white; max-width: 800px; margin: 0 auto;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #ccc; padding-bottom: 20px; margin-bottom: 30px;">
         <div style="display: flex; align-items: center; gap: 16px;">
           ${schoolSettings?.logoUrl 
              ? `<img src="https://wsrv.nl/?url=${encodeURIComponent(schoolSettings.logoUrl)}" alt="Logo" style="height: 60px; object-fit: contain;" />`
              : `<h1 style="font-size: 24px; font-weight: 900; margin: 0; line-height: 1;">AVANCE<br/><span style="font-size: 8px; font-weight: normal; letter-spacing: 2px;">Academia de Música</span></h1>`
           }
         </div>
         <h2 style="font-size: 18px; color: #4b5563; font-style: italic; margin: 0;">${schoolSettings?.tradingName || 'Avance Academia de Música'}</h2>
      </div>

      <div style="text-align: center; margin-bottom: 40px;">
         <h2 style="font-size: 18px; font-weight: bold; margin: 0;">CONTRATO DE PRESTAÇÃO DE SERVIÇO</h2>
         <p style="font-size: 12px; margin: 5px 0 0 0;">390/${(student.createdAt?.toDate ? student.createdAt.toDate() : new Date()).getFullYear()}</p>
      </div>

      <p style="text-align: justify; margin-bottom: 16px;">
        <strong>CONTRATANTE:</strong> 
        ${minor ? `
          <strong>${student.name}</strong>, menor impúbere, neste ato, representado pelo(a) Responsável/Contratante, <strong>${student.responsibleName || '___'}</strong>, inscrito no CPF sob o n.º <strong>${student.responsibleCpf || '___'}</strong>,
        ` : `
           <strong>${student.name}</strong>, inscrito no CPF sob o n.º <strong>${student.cpf || '___'}</strong>,
        `}
        residente em <strong>${student.address || '___'}, ${student.addressNumber || '___'}</strong>, bairro <strong>${student.neighborhood || '___'}</strong>, CEP <strong>${student.cep || '___'}</strong> em <strong>${student.city || '___'} - ${student.state || '___'}</strong>.
      </p>

      <p style="text-align: justify; margin-bottom: 16px;">
        <strong>CONTRATADA: ${schoolSettings?.companyName || 'B. Salvador da Silva Braz Costa'}</strong>, pessoa jurídica inscrita no CNPJ sob o n.º <strong>${schoolSettings?.cnpj || '39.487.516/0001-48'}</strong>, com sede à <strong>${schoolSettings?.address || 'Avenida Oswaldo Cruz, 217'}</strong>, CEP <strong>${schoolSettings?.cep || '55.012-040'}</strong> em <strong>${schoolSettings?.city || 'Caruaru'} - ${schoolSettings?.state || 'PE'}</strong>.
      </p>

      <div style="text-align: justify; margin-bottom: 40px;">
        ${text}
      </div>

      <div style="text-align: center; margin-top: 60px;">
         <p style="font-weight: bold; margin-bottom: 60px;">Caruaru - PE, ${getFormattedDate(student.createdAt)}</p>
         
         <table style="width: 100%; margin-top: 40px; table-layout: fixed;">
           <tr>
             <td style="text-align: center; padding: 0 20px; vertical-align: bottom;">
                <div style="margin-bottom: 8px; text-align: center;">
                  <div style="display: inline-block; padding: 6px 12px; border: 2px dashed #059669; border-radius: 8px; background-color: #f0fdf4; transform: rotate(1deg); box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <span style="font-size: 11px; font-weight: 900; color: #059669; text-transform: uppercase;">ASSINADO DIGITALMENTE</span><br/>
                    <span style="font-size: 8px; color: #047857; font-family: monospace;">Admin: ${profile.displayName || 'Sistema'}</span>
                  </div>
                </div>
               <div style="border-top: 1px solid black; margin-bottom: 5px;"></div>
               <p style="margin:0; font-weight: bold; font-size: 11px; text-transform: uppercase;">${schoolSettings?.tradingName || 'Avance Academia de Música'}</p>
               <p style="margin:0; font-size: 9px; color: #666;">Contratada / Representante</p>
             </td>
             <td style="text-align: center; padding: 0 20px; vertical-align: bottom;">
                ${(student as any).signatureIp ? `
                  <div style="margin-bottom: 8px; text-align: center;">
                    <div style="display: inline-block; padding: 6px 12px; border: 2px dashed #059669; border-radius: 8px; background-color: #f0fdf4; transform: rotate(-2deg); box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                      <span style="font-size: 11px; font-weight: 900; color: #059669; text-transform: uppercase;">ASSINADO DIGITALMENTE</span><br/>
                      <span style="font-size: 8px; color: #047857; font-family: monospace;">IP: ${(student as any).signatureIp}</span>
                    </div>
                  </div>
                ` : '<div style="height: 50px;"></div>'}
               <div style="border-top: 1px solid black; margin-bottom: 5px;"></div>
               <p style="margin:0; font-weight: bold; font-size: 11px; text-transform: uppercase;">${minor ? student.responsibleName : student.name}</p>
               <p style="margin:0; font-size: 9px; color: #666;">Contratante / Responsável</p>
             </td>
           </tr>
         </table>
      </div>
      
      <div style="margin-top: 80px; font-size: 9px; color: #a1a1aa; border-top: 1px solid #e4e4e7; padding-top: 15px; display: flex; justify-content: space-between;">
        <span>Documento gerado e assinado digitalmente na Plataforma Administrativa.</span>
        <span>ID do Aluno: ${student.id}</span>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = htmlContent;
  
  const opt = {
    margin: [10, 10, 10, 10],
    filename: `contrato_${student.id}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    html2canvas: { 
      scale: 2, 
      useCORS: true,
      ignoreElements: (node: Element) => {
        if (!node || !node.tagName) return false;
        const tag = node.tagName.toLowerCase();
        return tag === 'style' || tag === 'link' || tag === 'meta';
      }
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  let blob: Blob;

  try {
    blob = await html2pdf().set(opt).from(element).output('blob');
  } catch (error) {
    console.error("PDF generation error: ", error);
    throw error;
  }

  return blob;
};

export const generateDeclarationPDF = async (student: Student, request: DocumentRequest, schoolSettings: any, profile: UserProfile): Promise<Blob> => {
  const mainCourse = student.enrollments && student.enrollments.length > 0 ? student.enrollments[0] : null;
  const course = mainCourse ? mainCourse.instrument : 'Curso de Música';
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diasArray = student.enrollments?.flatMap((e: any) => e.schedule?.map((i: any) => diasSemana[i.day])) || [];
  const horariosArray = student.enrollments?.flatMap((e: any) => e.schedule?.map((i: any) => i.time)) || [];
  
  const dias = Array.from(new Set(diasArray)).filter(Boolean).join(', ');
  const horarios = Array.from(new Set(horariosArray)).filter(Boolean).join(', ');

  let rawTemplate = schoolSettings?.declarationTemplate || `Nenhum modelo configurado. Vá em Comunicação > Textos para configurar.`;

  let text = rawTemplate;
  text = text.replace(/\{\{nome\}\}/gi, student.name);
  text = text.replace(/\{\{cpf\}\}/gi, student.cpf || 'Não informado');
  text = text.replace(/\{\{rg\}\}/gi, student.rg || 'Não informado');
  text = text.replace(/\{\{nascimento\}\}/gi, student.birthDate ? format(new Date(student.birthDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Não informado');
  text = text.replace(/\{\{curso\}\}/gi, course);
  text = text.replace(/\{\{dias\}\}/gi, dias || 'Não informado');
  text = text.replace(/\{\{horarios\}\}/gi, horarios || 'Não informado');

  const htmlContent = `
    <div style="font-family: serif; color: black; max-width: 800px; margin: 0 auto; padding: 40px; text-align: left; line-height: 1.6; font-size: 15px;">
      <div style="text-align: center; margin-bottom: 30px; border-bottom: 1px solid #e4e4e7; padding-bottom: 20px;">
        ${schoolSettings?.logoUrl ? 
          `<img src="https://wsrv.nl/?url=${encodeURIComponent(schoolSettings.logoUrl)}&w=400&output=jpg" style="height: 60px; object-fit: contain; margin-bottom: 15px;" />` : 
          `<h1 style="font-size: 24px; font-weight: 900; color: #ea580c; text-transform: uppercase; margin: 0; letter-spacing: -0.05em;">${schoolSettings?.tradingName || 'AVANCE'}</h1>`
        }
        <h2 style="font-size: 20px; font-weight: bold; margin: 10px 0 5px 0; text-transform: uppercase; color: #18181b;">${schoolSettings?.tradingName || 'ESCOLA'}</h2>
        <p style="font-size: 12px; color: #71717a; margin: 0;">CNPJ: ${schoolSettings?.cnpj || ''}</p>
      </div>

      <h3 style="font-size: 22px; font-weight: 900; text-align: center; margin-bottom: 40px; text-transform: uppercase;">DECLARAÇÃO DE VÍNCULO</h3>

      <div style="margin-top: 40px; margin-bottom: 60px; min-height: 250px; font-size: 15px; line-height: 2; word-spacing: normal;">
        ${text}
      </div>
      
      <div style="text-align: right; margin-bottom: 60px; font-style: italic;">
        ${schoolSettings?.city || 'Caruaru'}, ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </div>

      <div style="margin-top: 60px; text-align: center;">
         <div style="margin: 0 auto 10px auto; width: 250px; padding: 10px; border: 2px dashed #16a34a; border-radius: 8px; background-color: #f0fdf4; text-align: center;">
           <div style="font-size: 10px; color: #16a34a; font-weight: bold; text-transform: uppercase;">ASSINADO DIGITALMENTE</div>
           <div style="font-size: 9px; color: #15803d; margin-top: 5px;">Admin: ${profile.displayName.split(' ')[0]}</div>
           <div style="font-size: 9px; color: #15803d; margin-top: 2px;">Em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
           <div style="font-size: 8px; color: #16a34a; margin-top: 2px;">Validado com Sucesso</div>
         </div>
         <div style="border-top: 1px solid black; margin-bottom: 5px; width: 250px; margin: 0 auto;"></div>
         <div style="font-weight: bold; font-size: 11px; text-transform: uppercase; text-align: center;">${schoolSettings?.companyName || 'Avance Academia de Música'}</div>
         <div style="font-size: 9px; color: #666; text-align: center; margin-top: 2px;">Direção / Secretaria</div>
      </div>
      
      <div style="margin-top: 80px; font-size: 9px; color: #a1a1aa; border-top: 1px solid #e4e4e7; padding-top: 15px; display: flex; justify-content: space-between;">
        <span>Documento gerado e assinado digitalmente na Plataforma Administrativa.</span>
        <span>ID do Aluno: ${student.id}</span>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = htmlContent;
  
  const opt = {
    margin: [10, 10, 10, 10],
    filename: `declaracao_${student.id}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    html2canvas: { 
      scale: 2, 
      useCORS: true,
      ignoreElements: (node: Element) => {
        if (!node || !node.tagName) return false;
        const tag = node.tagName.toLowerCase();
        return tag === 'style' || tag === 'link' || tag === 'meta';
      }
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  let blob: Blob;

  try {
    blob = await html2pdf().set(opt).from(element).output('blob');
  } catch (error) {
    console.error("PDF generation error: ", error);
    throw error;
  }

  return blob;
};
