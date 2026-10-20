import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { topics, codeExamples } from './topics.mjs';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const domains = { sql:'Учёба/SQL', programming:'Учёба/Программирование', english:'Учёба/English', knowledge:'Знания', productivity:'Практики', projects:'Проекты' };
export function random(seed) {
  let n = parseInt(sha(String(seed)).slice(0,8),16);
  return () => { n = (Math.imul(n,1664525)+1013904223)>>>0; return n/4294967296; };
}
export function walk(root) {
  const result=[];
  const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
    if(e.isSymbolicLink()) throw Error('Symlink input is not supported');
    const p=path.join(dir,e.name);
    if(e.isDirectory()){if(!e.name.startsWith('.'))visit(p);}else if(e.isFile()&&e.name.toLowerCase().endsWith('.md'))result.push(p);
  }};visit(root);return result;
}
export function sourceProfile(source) {
  const hints=Object.fromEntries(Object.keys(domains).map(k=>[k,0]));
  const patterns={sql:/sql|postgres|баз[аы] данн/i,programming:/python|javascript|программ|алгоритм|git|linux/i,english:/english|англий|grammar|vocabulary/i,knowledge:/obsidian|замет|знан|zettel/i,productivity:/продуктив|привыч|врем[яе]|цел[ьи]/i,projects:/план|задач|проект|иде[яи]/i};
  const hashes=[],privateShingles=new Set();let bytes=0;
  for(const file of walk(source)) {
    const data=fs.readFileSync(file);const text=new TextDecoder('utf-8',{fatal:true}).decode(data);
    bytes+=data.length;hashes.push(sha(path.relative(source,file)) + ':' + sha(data));
    for(const [key,re] of Object.entries(patterns))if(re.test(path.relative(source,file)))hints[key]++;
    for(const s of shingles(text,12))privateShingles.add(s);
  }
  return { public:{markdown:hashes.length,bytes,hints,fingerprint:sha(hashes.sort().join('\n'))}, privateShingles };
}
function* shingles(text,n) {
  const words=text.toLocaleLowerCase('en').match(/[\p{L}\p{N}_]+/gu)??[];
  for(let i=0;i+n<=words.length;i++)yield sha(words.slice(i,i+n).join(' '));
}
const relationCases=[
  ['near_duplicate','same_information','Почти одинаковое изложение одного правила; пригодность объединения требует чтения контекста.'],
  ['partial_overlap','partial_overlap','Общий тезис и разные самостоятельные детали; нельзя терять уникальные части.'],
  ['related_distinct','related_distinct','Один предмет, но разные вопросы: практическое применение и ограничение.'],
  ['idea_versions','conflicting','Два решения в разные моменты; сохранить историю, не сливать как дубликаты.'],
  ['contradictory_conditions','conflicting','Противоположные решения при одинаковом явно указанном условии. Нужна экспертная проверка.'],
  ['lexical_trap','related_distinct','Похожие слова относятся к разным объектам и разрешениям. Сходство не доказывает совпадение.'],
  ['paraphrase','same_information','Разная формулировка одного общего тезиса; эквивалентность оценивает человек.'],
  ['leave_unchanged','related_distinct','Справочное знание и незавершённый учебный вопрос разумно оставить отдельно.'],
];
function pairTexts(t,kind) {
  switch(kind) {
    case 0:return [`${t.fact}\n\n${t.a}\n`,`# ${t.title}\n\n${t.fact}\n\n${t.a}\n`];
    case 1:return [`${t.fact}\n\n${t.a}\n`,`# ${t.title}: ограничения\n\n${t.fact}\n\n${t.b}\n`];
    case 2:return [`# Практика: ${t.title}\n\n${t.a}\n\n${t.exercise}\n`,`# Граница: ${t.title}\n\n${t.b}\n\n${t.scenario}\n`];
    case 3:return [`# ${t.title}: решение 2022\n\n${t.scenario}\n\nВ учебном прототипе сохраняем отдельную ручную проверку. Автоматический шаг отложен до появления воспроизводимого примера.\n`,`# ${t.title}: пересмотр 2024\n\n${t.exercise}\n\nПрежнее решение о ручной проверке пересмотрено: для проверенного учебного набора вводим автоматический шаг. Для неизвестных входов остаётся ручной разбор.\n`];
    case 4:return [`# ${t.title}: условие запуска\n\n${t.a}\n\nПри неизвестном результате предыдущего запуска повтор учебной операции разрешён. Это рабочая гипотеза автора черновика, а не проверенное правило.\n`,`# ${t.title}: возражение\n\n${t.b}\n\nПри неизвестном результате предыдущего запуска повтор учебной операции запрещён. Сначала нужно выяснить результат.\n`];
    case 5:return [`# ${t.title}: исходник\n\nПроверка относится к исходной записи. Изменение исходной записи без подтверждения запрещено.\n\n${t.a}\n`,`# ${t.title}: отчёт\n\nПроверка относится к производному отчёту. Пересоздание производного отчёта после явного запуска разрешено. Исходная запись остаётся неизменной.\n\n${t.b}\n`];
    case 6:return [`${t.fact}\n`,`# Своими словами: ${t.title}\n\n${t.paraphrase}\n`];
    default:return [`# ${t.title}\n\n${t.fact}\n\n${t.b}\n`,`# Вопрос после практики\n\n${t.exercise}\n\n${t.scenario}\n\nПока не понял, достаточно ли этого примера. Вернуться после следующего упражнения.\n`];
  }
}
function response(a,b,shared,action='manual_review') {
  return {relation:shared?'partial_overlap':'related_distinct',explanation:{text:'Локальная контрольная классификация для испытания исполнителя.',evidence:['c1']},
    claims:[{id:'c1',kind:shared?'shared':'comparison',text:'Контрольные выдержки из двух синтетических файлов.',quoteA:shared??a.trim(),quoteB:shared??b.trim()}],
    recommendation:{action,reason:'Действие выбирается человеком в тестовом сценарии.',evidence:['c1']},alternatives:[],limitations:['Локальная фикстура проверяет протокол, а не качество модели или семантическую полноту.']};
}
function addScenarios(add) {
  const scenarios=[];
  const common='Кэш хранит результат до окончания заданного срока.';
  for(const operation of ['single','multi','merge','group','bundle','atomization','empty_atom','refusal']) {
    const base=`Лаборатория/${operation}`,paths=[`${base}/Основная.md`,`${base}/Дополнение.md`];
    let a=common+'\n\nУчебный отчёт сверяет свежесть результата перед показом.\n',b=common+'\n\nПри обновлении исходных данных прежний результат нужно проверить заново.\n';
    if(operation==='group') {a='# Справочник\n\n'+common+'\n\n## Условия\n\nПроверяем только учебный набор.\n';b='# Практика\n\n'+common+'\n\n## Наблюдения\n\n### Опыт\n\nВ испытании сравнивались короткий и длинный сроки хранения.\n\nКороткий срок дал больше обращений к источнику.\n\n## Продолжение\n\nНезависимое замечание остаётся в исходной заметке.\n';}
    if(operation==='bundle') b=common+'\n\nВ примере результат сохраняется в локальном словаре.\n\n```python\ncache = {}\ncache["lesson"] = "ready"\nprint(cache["lesson"])\n```\n\nСловарь живёт только в памяти текущего процесса; истечение срока здесь ещё не реализовано.\n';
    if(operation==='atomization'||operation==='empty_atom') {a='Для учебного отчёта день определяется в UTC.\n\nПроверка границы выполняется на событии около полуночи.\n';b='Для отчёта по местным занятиям день определяется в часовом поясе расписания.\n';}
    if(operation==='refusal') b='---\ntitle: Нестандартный документ\n---\n# Смешанный блок\n\n'+common+'\n\n<table><tr><td>HTML и [[Неизвестная цель]]</td></tr></table>\n\n```dataview\nTABLE file.mtime\n```\n\nСноска[^x].\n\n[^x]: Отдельное условие.\n';
    const r=response(a,b,['atomization','empty_atom'].includes(operation)?null:common);
    add(paths[0],a,'projects','scenario');add(paths[1],b,'projects','scenario');
    const scenario={id:operation,paths,operations:operation==='merge'||operation==='group'||operation==='bundle'?[operation,'archive','undo_archive','undo']:operation==='refusal'?['refusal']:[operation,'undo'],eligibility:'UNVERIFIED_REAL_PLANNER_REQUIRED',response:r};
    if(operation==='empty_atom'){scenario.target=`${base}/Новый атом.md`;add(scenario.target,'','projects','empty');}
    scenarios.push(scenario);
  }
  return scenarios;
}

export function generate({count=1000,seed='veynrel-lab-v2',profile={hints:{}}}={}) {
  if(!Number.isSafeInteger(count)||count<300||count>1000)throw Error('count must be an integer from 300 to 1000 (120 labelled pairs require 240 notes)');
  const rng=random(seed),notes=[],pairs=[];
  const add=(p,text,domain,form,extra={})=>{if(notes.some(n=>n.path===p))throw Error('Duplicate generated path');notes.push({path:p,text,domain,form,...extra});};
  const ordered=[...topics].sort((a,b)=>(profile.hints[b.domain]??0)-(profile.hints[a.domain]??0)||topics.indexOf(a)-topics.indexOf(b));
  for(let i=0;i<60;i++)for(let j=0;j<2;j++) {
    const t=ordered[i],kind=(i+j*3)%8,[category,expectedRelation,explanation]=relationCases[kind];
    const id=`pair-${String(pairs.length+1).padStart(3,'0')}`,texts=pairTexts(t,kind);
    const paths=[`${domains[t.domain]}/Сравнения/${t.title}/${j+1} — исходная.md`,`${domains[t.domain]}/Сравнения/${t.title}/${j+1} — переработка.md`];
    paths.forEach((p,k)=>add(p,texts[k],t.domain,'relationship',{pairId:id}));
    pairs.push({id,paths,category,expectedRelation,explanation,expertReview:[2,3,4,5,6,7].includes(kind),candidateScenarios:[0,1,6].includes(kind)?['inspect','single','multi','merge','no_change']:['inspect','no_change','manual_review'],eligibility:'UNVERIFIED_REAL_PLANNER_REQUIRED'});
  }
  const scenarios=addScenarios(add);
  for(let i=0;i<6;i++)add(`Inbox/Пустая ${i+1}.md`,'','knowledge','empty');
  const unusual=[['HTML','<div>Не переписывать HTML вместе с обычным абзацем.</div>'],['Сноски','Условие вынесено в сноску[^limit].\n\n[^limit]: Только для учебного набора.'],['Setext','Старый заголовок\n===============\n\nПроверить поддержку структуры перед изменением.'],['Повторный YAML','---\nname: one\n---\n\nТекст.\n\n---\nname: two\n---'],['Блок с идентификатором','Ссылка извне зависит от этого блока. ^stable-block'],['Вложенный callout','> [!warning] Контекст\n> > [!note] Условие\n> > Пример вложен в предупреждение.']];
  for(const [name,body] of unusual)add(`Лаборатория/Неподдерживаемое/${name}.md`,body+'\n','knowledge','unsupported');
  add('Проекты/Архив/План.md','# План\n\nПервый вариант каталога использует один файл.\n','projects','draft');
  add('Проекты/Каталог/План.md','# План\n\nВ текущем варианте карточки отделены от истории чтения.\n','projects','decision');
  const large=[];
  for(let i=0;i<3;i++) {
    const p=`Справочники/Большой конспект ${i+1}.md`;
    const chapters=ordered.slice(i*20,i*20+20).map((t,k)=>`## ${k+1}. ${t.title}\n\n${t.fact}\n\n${t.a}\n\n### Ограничение\n\n${t.b}\n\n#### Практика\n\n${t.exercise}\n\n##### Наблюдение\n\n${t.scenario}\n\n###### Пересказ\n\n${t.paraphrase}\n\n> ${t.english}\n\n| Наблюдение | Проверка |\n| --- | --- |\n| ${t.scenario} | ${t.exercise} |\n\n- [ ] Объяснить правило на собственном примере\n- [ ] Указать границу применимости\n`).join('\n');
    const appendix=ordered.slice(i*20,i*20+20);
    const table='## Сводная таблица\n\n| Тема | Условие | Ограничение |\n| --- | --- | --- |\n'+appendix.map(t=>`| ${t.title} | ${t.fact} | ${t.b} |`).join('\n');
    const tasks='## Очередь практики\n\n'+appendix.map(t=>`- [ ] ${t.exercise}`).join('\n');
    add(p,`# Учебная тетрадь ${i+1}\n\n${chapters}\n${table}\n\n${tasks}\n`,'knowledge','long');large.push(p);
  }
  // Twelve forms use different authored fields; length comes from actual material, never padding.
  const forms=['inbox','lesson','atomic','draft','decision','changed_plan','tasks','practice','reference','diary','english','worked_example'];
  const variants=['наблюдение','упражнение','шпаргалка','вопрос','разбор','контекст','ограничение','проверка','проект','повторение','обзор','решение'];
  const fillerCount=count-notes.length-Object.keys(domains).length;
  for(let i=0;i<fillerCount;i++) {
    const topicIndex=i%ordered.length,round=Math.floor(i/ordered.length),t=ordered[topicIndex];
    const form=forms[(topicIndex+round)%forms.length];const day=1+Math.floor(rng()*27),month=1+Math.floor(rng()*12),year=2021+(round%5),date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const code=codeExamples[t.domain]?.[topics.filter(n=>n.domain===t.domain).indexOf(t)%12];
    let body;
    switch(form) {
      case 'inbox':body=`${t.exercise}\n\n${round%2?'Нужен контрпример.':'Проверить на маленьком наборе, прежде чем переносить в основной конспект.'}\n`;break;
      case 'lesson':body=`# ${t.title}\n\n${t.fact}\n\n## Как это увидеть\n\n${t.a}\n\n${t.scenario}\n\n> [!note] Граница объяснения\n> ${t.b}\n\n## Своими словами\n\n${t.paraphrase}\n\n${code?`\`\`\`${code[1]}\n${code[2]}\n\`\`\`\n`:`> ${t.english}\n`}\n## Самопроверка\n\n${t.exercise}\n\n| Проверка | Что записать |\n| --- | --- |\n| До изменения | Предполагаемый результат примера |\n| После изменения | Наблюдение и нарушенное условие |\n\n- [ ] Построить пример, в котором условие соблюдается\n- [ ] Изменить только условие и объяснить разницу\n`;break;
      case 'atomic':body=`${t.paraphrase}\n\n${t.b}\n\n#знания/${t.domain}\n`;break;
      case 'draft':body=`# ${t.title} — пока черновик\n\n${t.scenario}\n\n${t.a}\n\n??? ${t.exercise}\n\n- мысль о границе: ${t.b}\n`;break;
      case 'decision':body=`# Решение: ${t.title}\n\n## Основание\n\n${t.scenario}\n\n## Что беру в работу\n\n${t.a}\n\n## Что ещё учесть\n\n${t.b}\n`;break;
      case 'changed_plan':body=`# Пересмотр занятия\n\nБыло запланировано: ${t.exercise}\n\nПосле разбора: ${t.scenario}\n\nВ следующей версии хочу явно проверить ограничение:\n\n> ${t.b}\n\n- [x] Сохранить прежнюю формулировку задачи\n- [ ] Дописать маленький пример\n`;break;
      case 'tasks':body=`# Практикум: ${t.title}\n\n- [x] Сформулировать правило: ${t.paraphrase}\n- [ ] ${t.exercise}\n- [ ] Объяснить ограничение: ${t.b}\n`;break;
      case 'practice':body=`# ${t.title}: рабочая запись\n\n${t.scenario}\n\n${code?`\`\`\`${code[1]}\n${code[2]}\n\`\`\`\n`:`> ${t.english}\n`}\n${t.exercise}\n`;break;
      case 'reference':body=`# ${t.title}: справка\n\n| Часть | Смысл |\n| --- | --- |\n| Правило | ${t.fact} |\n| Пример | ${t.a} |\n| Ограничение | ${t.b} |\n\n${t.english}\n`;break;
      case 'diary':body=`# ${date}: учебная заметка\n\n${t.scenario}\n\nСледующая попытка: ${t.exercise}\n\n${t.paraphrase}\n`;break;
      case 'english':body=`# ${t.english.replace(/[.!?]$/, "")}\n\n## Check understanding\n\n${round%2?"Which assumption would you change first to challenge this statement?":"Build a small example, then describe the condition that makes it work."}\n`;break;
      default:body=`# Разбор попытки: ${t.title}\n\n${t.exercise}\n\n## Что увидел\n\n${t.scenario}\n\n## Исправленная формулировка\n\n${t.paraphrase}\n\n${code?`\`\`\`${code[1]}\n${code[2]}\n\`\`\`\n`:`> ${t.english}\n`}`;
    }
    const p=form==='diary'?`Дневник/${year}/${date} — ${t.title}.md`:form==='inbox'?`Inbox/${t.title} — ${round+1}.md`:`${domains[t.domain]}/${t.title} — ${variants[round%variants.length]} ${round+1}.md`;
    if(i%3===0)body=`---\naliases: ["${t.title} — ${form} ${round+1}"]\ntags: [${t.domain}, ${form}]\ncreated: ${date}\nstatus: ${['draft','learning','reviewed'][i%3===0?round%3:i%3]}\n---\n\n`+body;
    add(p,body,t.domain,form,{language:form==='english'?'en':'ru'});
  }
  for(const [domain,folder] of Object.entries(domains)) {
    const targets=notes.filter(n=>n.domain===domain&&n.form!=='relationship'&&n.form!=='empty'&&n.form!=='scenario').slice(0,9);
    add(`${folder}/Маршрут.md`,`# Маршрут по теме\n\nНачать с вопроса, затем проверить пример и границы его применения.\n\n${targets.map((n,i)=>`${i+1}. [[${n.path.slice(0,-3)}]]`).join('\n')}\n`,domain,'moc');
  }
  // References avoid operation fixtures and intentional isolates; no hidden dependency is attached to a safe scenario.
  const linked=notes.filter(n=>!['scenario','empty','unsupported'].includes(n.form)&&!n.pairId&&n.form!=='moc');
  const isolatedPaths=new Set(linked.filter((_,i)=>i%23===0).map(n=>n.path));
  const linkTargets=linked.filter(n=>!isolatedPaths.has(n.path));
  let broken=0;
  for(let i=0;i<linkTargets.length;i++) {
    const n=linkTargets[i],same=linkTargets.filter(x=>x.domain===n.domain&&x.path!==n.path);const target=same[Math.floor(rng()*same.length)];
    if(target)n.text+=`\n${n.language==='en'?'See also':'См.'} [[${target.path.slice(0,-3)}|${n.language==='en'?'related note':'связанная запись'}]].\n`;
    if(i%17===0){n.text+=`\n[[Ожидаемые материалы/Не написано ${++broken}]]\n`;}
    if(i%31===0){n.text+=`\n![[${large[i%3].slice(0,-3)}#1. ${ordered[(i%3)*20].title}]]\n`;}
    if(i%29===0)n.text+='\nЭта формулировка остаётся точкой для обратной ссылки. ^lab-reference\n';
  }
  for(let i=0;i<linkTargets.length;i+=37){const target=linkTargets.find((n,j)=>j!==i&&n.text.includes('^lab-reference'));if(target)linkTargets[i].text+=`\n[[${target.path.slice(0,-3)}#^lab-reference]]\n`;}
  if(notes.length!==count)throw Error('Incorrect generated count');
  return {notes,pairs,scenarios,seed:String(seed)};
}

export function validate(dataset, privateShingles=new Set()) {
  const {notes,pairs}=dataset,known=new Set(notes.map(n=>n.path)),edges=new Map(notes.map(n=>[n.path,new Set()])),incoming=new Map(notes.map(n=>[n.path,0]));
  const sizes=[],hashes=new Map(),forms={},themes={},structures={};let links=0,broken=0,privateMatches=0,secretMatches=0;
  const patterns={frontmatter:/^---\n/,wiki:/\[\[/,embed:/!\[\[/,code:/^```/m,table:/^\|/m,quote:/^> /m,callout:/^> \[!/m,tasks:/^- \[[ x]\]/m,aliases:/^aliases:/m,block:/\^[a-z][\w-]+/};
  for(let level=1;level<=6;level++)patterns['h'+level]=new RegExp('^'+'#'.repeat(level)+' ','m');
  for(const n of notes) {
    const raw=Buffer.from(n.text,'utf8');if(new TextDecoder('utf-8',{fatal:true}).decode(raw)!==n.text||n.text.includes('\0'))throw Error('Invalid generated UTF-8');
    sizes.push(raw.length);forms[n.form]=(forms[n.form]??0)+1;themes[n.domain]=(themes[n.domain]??0)+1;
    const digest=sha(raw);hashes.set(digest,[...(hashes.get(digest)??[]),n]);
    for(const [k,re]of Object.entries(patterns))if(re.test(n.text))structures[k]=(structures[k]??0)+1;
    for(const match of n.text.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
      links++;const target=match[1].split('|')[0].split('#')[0]+'.md';
      if(known.has(target)){edges.get(n.path).add(target);incoming.set(target,incoming.get(target)+1);}else broken++;
    }
    if([...shingles(n.text,12)].some(s=>privateShingles.has(s)))privateMatches++;
    if(/(?:sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,})/.test(n.text))secretMatches++;
  }
  const accidentalDuplicates=[...hashes.values()].filter(group=>group.length>1&&group[0].text.trim()&&group.some(n=>!n.pairId&&n.form!=='scenario'));
  if(privateMatches||secretMatches||accidentalDuplicates.length)throw Error(`Privacy/uniqueness validation failed: private=${privateMatches}, secrets=${secretMatches}, duplicateGroups=${accidentalDuplicates.length}`);
  for(const p of pairs)if(p.paths.some(p=>!known.has(p)))throw Error('Missing labelled path');
  sizes.sort((a,b)=>a-b);
  return {count:notes.length,utf8:true,bytes:sizes.reduce((a,b)=>a+b,0),sizes:{min:sizes[0],p10:sizes[Math.floor(sizes.length*.1)],median:sizes[Math.floor(sizes.length*.5)],p90:sizes[Math.floor(sizes.length*.9)],max:sizes.at(-1)},forms,themes,structures,internalLinks:links,brokenLinks:broken,isolated:notes.filter(n=>!edges.get(n.path).size&&!incoming.get(n.path)).length,empty:sizes.filter(n=>n===0).length,labelledPairs:pairs.length,pairCategories:Object.fromEntries(relationCases.map(([c])=>[c,pairs.filter(p=>p.category===c).length])),accidentalDuplicateGroups:0,private12WordMatches:privateMatches,secretPatternMatches:secretMatches,englishNotes:notes.filter(n=>n.language==='en').length};
}
