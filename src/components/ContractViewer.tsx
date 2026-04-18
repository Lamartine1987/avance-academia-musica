import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { Student } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Loader2 } from 'lucide-react';

export default function ContractViewer({ student, onClose }: { student: Student, onClose: () => void }) {
  
  const getFormattedDate = (timestampOrString: any) => {
    try {
      const date = typeof timestampOrString === 'string' ? new Date(timestampOrString) : (timestampOrString?.toDate ? timestampOrString.toDate() : new Date());
      return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  const isMinor = () => {
    if (!student.birthDate) return false;
    const diff = new Date().getTime() - new Date(student.birthDate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)) < 18;
  };

  const mainCourse = student.enrollments && student.enrollments.length > 0 ? student.enrollments[0] : null;

  const [schoolSettings, setSchoolSettings] = useState<any>(null);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'school'));
        if (snap.exists()) {
          setSchoolSettings(snap.data());
        } else {
          setSchoolSettings({});
        }
      } catch {
        setSchoolSettings({});
      }
    };
    fetchTemplate();
  }, []);

  const renderClauses = () => {
    if (schoolSettings === null) {
      return <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>;
    }

    if (!schoolSettings.contractTemplate) {
      return (
        <div className="pl-4 space-y-4 text-justify">
          <p><strong>CLÁUSULA PRIMEIRA</strong> - O objeto do presente instrumento é a prestação, pela CONTRATADA, em favor do(a) CONTRATANTE, dos serviços de ensino de música (CNAE 8592-9/03), por meio de aulas de música e prática de instrumentos na modalidade <strong>{mainCourse ? mainCourse.instrument : 'Curso de Música'}</strong>.</p>
          
          <p className="ml-4"><strong>Parágrafo 1º</strong> - O curso compreende aulas teóricas e práticas, ministradas por professores qualificados e sempre que necessário, a critério dos professores, a utilização de equipamentos de som e imagem. <strong>AS AULAS SERÃO EM {student.classType === 'individual' ? 'FORMATO INDIVIDUAL' : 'GRUPO (ATÉ DOIS ALUNOS POR TURMA)'}.</strong></p>
          
          <p className="ml-4"><strong>Parágrafo 2º</strong> - As aulas são intransferíveis, ministradas <strong>{mainCourse?.schedule ? mainCourse.schedule.length : 1} vez(es) por semana</strong>, com duração de <strong>{mainCourse?.duration || 60} (sessenta) minutos</strong> em dia e horário fixo, escolhido no ato da matrícula de acordo com a disponibilidade de horário do curso contratado.</p>
          
          <p><strong>CLÁUSULA SEGUNDA</strong> - Caso o(a) CONTRATANTE não compareça a aula, computar-se-á a aula no pacote mensal do(a) CONTRATANTE, salvo nos casos de enfermidade ou internação hospitalar, devidamente comprovadas por atestado médico. <strong>A tolerância para atraso do aluno será de 20 minutos.</strong></p>
          
          <p className="ml-4"><strong>Parágrafo 1º</strong> - Deveres do Contratante(aluno): comportar-se com civilidade, observando os preceitos de disciplina e boa educação, respeito aos colegas e professores, sendo passível de rescisão deste contrato o comportamento inadequado do aluno. Não é permitida a entrada de acompanhantes, crianças(dependentes) e ou animais domésticos em sala de aula (exceto em casos de alunos portadores de necessidades especiais) <strong>NÃO É PERMITIDO O CONSUMO DE BEBIDAS ALCOÓLICAS E ALIMENTOS NAS SALAS DE AULA E NAS DEPENDÊNCIAS DA ESCOLA.</strong></p>
          
          <p className="ml-4 uppercase"><strong>Parágrafo 2º - TODO DANO OU PREJUÍZO CAUSADO PELO ALUNO NA ESTRUTURA FÍSICA DESTE ESTABELECIMENTO DE ENSINO, OS PAIS OU RESPONSÁVEIS DEVERÃO RESSARCIR AS DESPESAS À CONTRATADA, NO PRAZO DE 10 DIAS.</strong></p>
          
          <p className="ml-4"><strong>Parágrafo 3º</strong> - Durante o período de recesso(datas disponíveis no calendário da Escola) essas aulas não serão repostas. Aulas que porventura caiam em feriados <strong>(Nacional, Estadual e Municipal), não serão repostas, assim como em datas especiais: Dia do Professor</strong>.</p>
          
          <p><strong>CLÁUSULA TERCEIRA</strong> - Em contrapartida aos serviços prestados, o(a) CONTRATANTE pagará em favor da CONTRATADA o valor certo e ajustado de <strong>R$ {Number(student.courseValue || 0).toFixed(2).replace('.',',')}</strong>, o qual será pago mensalmente igual e sucessivamente, sendo que a primeira vencerá no dia <strong>{student.dueDate || 10} de {getFormattedDate(student.createdAt).split(' ').slice(2).join(' ')}</strong>.</p>
          
          <p className="ml-4"><strong>Parágrafo 1º</strong> - No caso de inadimplência de quaisquer das parcelas, haverá a incidência de multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês ou fração sobre o valor vencido e não pago.</p>
          <p className="ml-4"><strong>Parágrafo 2º</strong> - No caso de inadimplência por mais de 20(vinte) dias, o pacote do (a) CONTRATANTE será suspenso até a liquidação das pendências financeiras.</p>
          <p className="ml-4"><strong>Parágrafo 3º</strong> - O contratante (responsável), deve fornecer um número para contato e e-mail atualizados. Autoriza também receber através do aplicativo WhatsApp e do e-mail, avisos e cobranças. (Que podem ser feitos através de qualquer plataforma ou banco utilizados pela escola).</p>
          
          <p><strong>CLÁUSULA QUARTA</strong> - Pelo presente instrumento, o(a) CONTRATANTE cede em favor da CONTRATADA os direitos de utilização de sua imagem e voz em eventos da escola.</p>
          <p><strong>CLÁUSULA QUINTA</strong> - O(A) CONTRATANTE poderá optar pela resilição do presente contrato antes do seu término, devendo, para tanto, comunicar tal intenção à CONTRATADA com antecedência mínima de 30 (trinta) dias.</p>
          <p><strong>CLÁUSULA SEXTA</strong> - As partes elegem o Foro da Comarca <strong>Caruaru</strong>, como o único competente para dirimir toda e qualquer dúvida, controvérsia e litígio, decorrente do exato cumprimento deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja ou venha a ser.</p>
          
          <p>E assim, por estarem justas e contratadas, as partes assinam o presente em duas (02) vias de igual teor, valor e forma, após lido e achado conforme.</p>
        </div>
      );
    }

    const frequency = mainCourse?.schedule ? mainCourse.schedule.length + ' vez(es) por semana' : '1 vez(es) por semana';
    const duration = mainCourse?.duration ? mainCourse.duration + ' minutos' : '60 minutos';
    const format = student.classType === 'individual' ? 'FORMATO INDIVIDUAL' : 'EM GRUPO';
    const course = mainCourse ? mainCourse.instrument : 'Curso de Música';
    const value = student.courseValue ? Number(student.courseValue).toFixed(2).replace('.',',') : '0,00';
    const dueDay = student.dueDate || 10;
    const dueMonth = getFormattedDate(student.createdAt).split(' ').slice(2).join(' ');
    
    let text = schoolSettings.contractTemplate;
    text = text.replace(/\{\{curso\}\}/g, course);
    text = text.replace(/\{\{formato\}\}/g, format);
    text = text.replace(/\{\{frequencia\}\}/g, frequency);
    text = text.replace(/\{\{duracao\}\}/g, duration);
    text = text.replace(/\{\{valor\}\}/g, value);
    text = text.replace(/\{\{vencimento\}\}/g, dueDay + ' ' + dueMonth);
    text = text.replace(/&nbsp;/g, ' ');

    return (
      <div 
        className="pl-4 space-y-4 text-justify break-words [&_p]:mb-4 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4"
        dangerouslySetInnerHTML={{ __html: text }} 
      />
    );
  };

  const content = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-6 bg-zinc-900/60 backdrop-blur-sm print:static print:block print:bg-white print:backdrop-blur-none">
      <style>{`
        @media print {
          body > #root {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
      <div className="relative w-full max-w-5xl bg-zinc-100 rounded-none md:rounded-[32px] shadow-2xl h-full md:h-[90vh] flex flex-col ring-1 ring-zinc-950/5 overflow-hidden print:static print:block print:shadow-none print:ring-0 print:h-auto print:rounded-none">
        
        {/* Header Bar - Hidden on print */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-zinc-200 print:hidden">
          <h3 className="text-lg font-bold display-font text-zinc-800">Visualizador de Documento</h3>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-zinc-800 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir PDF
            </button>
            <button 
              onClick={onClose} 
              className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contract Scrollable Container */}
        <div id="print-contract-area" className="flex-1 overflow-y-auto p-4 md:p-8 print:block print:p-0 print:overflow-visible">
          
          {/* The Actual Document - Styled for Paper */}
          <div className="bg-white p-8 md:p-12 border shadow-sm max-w-4xl mx-auto text-[13px] text-black leading-relaxed font-serif print:max-w-none print:shadow-none print:border-none print:p-0">
            
            <div className="flex items-center justify-between mb-8 border-b border-zinc-300 pb-6">
               <div className="flex items-center gap-4">
                 {schoolSettings?.logoUrl ? (
                   <img src={schoolSettings.logoUrl} alt="Logo" className="h-16 object-contain" />
                 ) : (
                   <img src="/logo-avance.png" alt="Logo Avance" className="h-16 object-contain" />
                 )}
                 {!schoolSettings?.logoUrl && (
                   <h1 className="text-2xl font-black text-black tracking-tighter">
                      AVANCE
                      <span className="block text-[8px] tracking-widest mt-1 uppercase">Academia de Música</span>
                   </h1>
                 )}
               </div>
               <h2 className="text-xl text-zinc-600 font-bold italic">{schoolSettings?.tradingName || 'Avance Academia de Música'}</h2>
            </div>
      
            <div className="text-center mb-10">
               <h2 className="text-xl font-bold uppercase tracking-wide">CONTRATO DE PRESTAÇÃO DE SERVIÇO</h2>
               <p className="text-sm">390/{(student.createdAt?.toDate ? student.createdAt.toDate() : new Date()).getFullYear()}</p>
            </div>
            
            <p className="mb-4 text-justify">
              <strong>CONTRATANTE:</strong> 
              {isMinor() ? (
                <>
                  <strong>{student.name}</strong>, menor impúbere, neste ato, representado pelo(a) Responsável/Contratante, <strong>{student.responsibleName || 'Não Informado'}</strong>, brasileiro(a), portador(a) da carteira de identidade RG de n.º <strong>{student.responsibleRg || '___'}</strong>, inscrito(a) no CPF/MF sob o n.º <strong>{student.responsibleCpf || '___'}</strong>,
                </>
              ) : (
                <>
                   <strong>{student.name}</strong>, brasileiro(a), portador(a) da carteira de identidade RG de n.º <strong>{student.rg || '___'}</strong>, inscrito(a) no CPF/MF sob o n.º <strong>{student.cpf || '___'}</strong>,
                </>
              )}
              {' '}residente e domiciliado(a) em <strong>{student.address || '___'}, {student.addressNumber || '___'}</strong>, bairro <strong>{student.neighborhood || '___'}</strong>, CEP <strong>{student.cep || '___'}</strong> em <strong>{student.city || '___'} - {student.state || '___'}</strong>.
            </p>
      
            <p className="mb-4 text-justify">
              <strong>CONTRATADA: {schoolSettings?.companyName || 'B. Salvador da Silva Braz Costa'}</strong>, pessoa jurídica de direito privado, regularmente inscrita no CNPJ/MF sob o n.º <strong>{schoolSettings?.cnpj || '39.487.516/0001-48'}</strong>, com sede à <strong>{schoolSettings?.address || 'Avenida Oswaldo Cruz, número 217, Maurício de Nassau'}</strong>, CEP <strong>{schoolSettings?.cep || '55.012-040'}</strong> em <strong>{schoolSettings?.city || 'Caruaru'}{schoolSettings?.state ? ` - ${schoolSettings?.state}` : ''};</strong>
            </p>
      
            <p className="mb-6 text-justify">
              As partes acima qualificadas têm entre si, justo e contratado, o presente contrato de prestação de serviços de ensino de música, o qual se regerá pelas seguintes cláusulas e condições.
            </p>
      
            {renderClauses()}
      
            <div className="mt-16 text-center">
               <p className="font-bold mb-16">Caruaru - PE, {getFormattedDate(student.createdAt)}</p>
               
               <div className="flex justify-between items-end mt-8 gap-10">
                 <div className="flex-1 text-center">
                   <div className="border-t border-black w-full mb-1"></div>
                   <p className="font-bold text-xs uppercase">{schoolSettings?.tradingName || 'Avance Academia de Música'}</p>
                   <p className="text-[10px]">Contratada</p>
                 </div>
                 
                 <div className="flex-1 text-center relative">
                   <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-70 w-full flex flex-col items-center justify-center">
                     <span className="text-[10px] text-emerald-600 font-bold border border-emerald-600 rounded px-2 py-1 rotate-[-5deg] bg-emerald-50">
                       ASSINADO DIGITALMENTE
                     </span>
                     {(student as any).signatureIp && (
                        <span className="text-[8px] text-zinc-400 mt-1">IP/Autenticação: {(student as any).signatureIp}</span>
                     )}
                   </div>
                   <div className="border-t border-black w-full mb-1 relative mt-16"></div>
                   <p className="font-bold text-xs uppercase">{isMinor() ? student.responsibleName : student.name}</p>
                   <p className="text-[10px]">Contratante / Responsável</p>
                 </div>
               </div>
            </div>
            
            <div className="mt-20 text-[9px] text-zinc-400 border-t border-zinc-200 pt-4 flex justify-between">
              <span>Documento gerado e assinado digitalmente na Plataforma Administrativa Avance.</span>
              <span>ID: {student.id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
