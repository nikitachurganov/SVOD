// Run through Figma use_figma, once per LEVEL. Native editable FigJam nodes.
const LEVEL = '__LEVEL__';
const page = await figma.getNodeByIdAsync('31:288');
await figma.setCurrentPageAsync(page);
for (const style of ['Regular', 'Medium', 'Bold']) await figma.loadFontAsync({family:'Inter', style});
const ids=[], refs={};
const rgb = hex => ({r:parseInt(hex.slice(0,2),16)/255,g:parseInt(hex.slice(2,4),16)/255,b:parseInt(hex.slice(4,6),16)/255});
const paint = hex => [{type:'SOLID',color:rgb(hex)}];
const C={ink:'17324D',muted:'526579',blue:'438BD1',blueLine:'2467A6',person:'173F67',component:'C2E5FF',external:'77818C',plan:'FFF4DA',planLine:'BD8B2C',line:'647789',white:'FFFFFF',boundary:'F5FBFF'};
function track(n){ids.push(n.id);return n;}
function section(parent,name,x,y,w,h,fill='FFFFFF') {const n=track(figma.createSection());n.name=name;n.resize(w,h);n.fills=paint(fill);parent.appendChild(n);n.x=x;n.y=y;return n;}
function text(parent,content,x,y,w,size=20,bold=false,color=C.ink){const n=track(figma.createText());n.name=content.split('\n')[0];n.fontName={family:'Inter',style:bold?'Bold':'Regular'};n.fontSize=size;n.lineHeight={unit:'PERCENT',value:135};n.fills=paint(color);n.characters=content;n.textAutoResize='HEIGHT';n.resize(w,1);parent.appendChild(n);n.x=x;n.y=y;return n;}
const measure=figma.createText();measure.fontName={family:'Inter',style:'Medium'};measure.fontSize=20;measure.lineHeight={unit:'PERCENT',value:135};measure.textAutoResize='HEIGHT';
function box(parent,key,title,meta,desc,x,y,w=360,kind='container',minH=210){
 const label=title+'\n'+meta+'\n\n'+desc;
 measure.resize(w-64,1);measure.characters=label;
 const h=Math.ceil(Math.max(minH,measure.height+72)/8)*8;
 const n=track(figma.createShapeWithText());n.name=key+' · '+title;n.shapeType=kind==='db'?'ENG_DATABASE':'ROUNDED_RECTANGLE';
 n.text.fontName={family:'Inter',style:'Medium'};n.text.fontSize=20;n.text.lineHeight={unit:'PERCENT',value:135};n.text.characters=label;n.text.setRangeFontName(0,title.length,{family:'Inter',style:'Bold'});
 n.text.textAlignHorizontal='CENTER';
 const fill=kind==='component'?C.component:kind==='person'?C.person:kind==='external'?C.external:kind==='plan'?C.plan:C.blue;
 n.fills=paint(fill);n.strokes=paint(kind==='component'?C.blue:kind==='plan'?C.planLine:kind==='external'?C.external:C.blueLine);n.strokeWeight=2;
 n.text.fills=paint(kind==='component'||kind==='plan'?C.ink:C.white);if(kind==='plan')n.dashPattern=[10,6];
 n.resize(w,h);parent.appendChild(n);n.x=x;n.y=y;refs[key]=n;return n;
}
function edge(parent,from,to,label,sm='AUTO',em='AUTO',planned=false,straight=false,startPosition,endPosition){const n=track(figma.createConnector());n.name=from+' → '+to;n.connectorStart={endpointNodeId:refs[from].id,...(startPosition?{position:startPosition}:{magnet:sm})};n.connectorEnd={endpointNodeId:refs[to].id,...(endPosition?{position:endPosition}:{magnet:em})};n.connectorLineType=straight?'STRAIGHT':'ELBOWED';n.connectorStartStrokeCap='NONE';n.connectorEndStrokeCap='ARROW_EQUILATERAL';n.strokeWeight=2;n.strokes=paint(planned?C.planLine:C.line);n.dashPattern=planned?[10,6]:[];n.text.fontName={family:'Inter',style:'Regular'};n.text.fontSize=16;n.text.lineHeight={unit:'PERCENT',value:130};n.text.characters=label;n.text.fills=paint(C.ink);n.textBackground.fills=paint(C.white);parent.appendChild(n);return n;}
function header(s,num,title,sub,w){text(s,num+' / '+title,64,56,w-128,42,true);text(s,sub,64,130,w-128,22,false,C.muted);}
function legend(s,y,w){text(s,'ЛЕГЕНДА  ·  Тёмный синий: человек  ·  Синий: система / контейнер\nСветлый синий: компонент  ·  Серый: внешняя система  ·  Золотой пунктир: планируется',64,y,w-128,18,false,C.muted);}
let wrapper=page.children.find(n=>n.type==='SECTION'&&n.name==='СВОД · C4 · 2026-10-14');
if(!wrapper){wrapper=section(page,'СВОД · C4 · 2026-10-14',3700,-448,9416,3480);text(wrapper,'СВОД / Архитектура C4',64,48,8500,56,true);text(wrapper,'Сбор заявок, управление работой и AI-помощь внутри организаций',64,138,8500,26,false,C.muted);text(wrapper,'L1 → L2 → L3   ·   Реализованная архитектура + явно обозначенные планы   ·   14.10.2026',64,205,8500,20,false,C.muted);}
if(LEVEL==='context'){
 const s=section(wrapper,'01 · Context',64,320,2400,3080);header(s,'01','Контекст системы','Кто использует СВОД и с какими внешними системами он взаимодействует.',2400);
 box(s,'owner','Администратор организации','[Person]','Создаёт формы, распределяет заявки и контролирует выполнение.',64,330,360,'person');
 box(s,'member','Внутренний исполнитель','[Person]','Берёт заявки в работу, выполняет этапы и фиксирует результат.',64,790,360,'person');
 box(s,'applicant','Заявитель','[Person]','Отправляет заявку через публичную форму или Telegram.',64,1250,360,'person');
 box(s,'contractor','Внешний исполнитель','[Person]','Выполняет порученную работу. Результат фиксирует ответственный в СВОД.',64,1710,360,'person');
 box(s,'svod','СВОД','[Software System]','B2B SaaS: сбор и структурирование заявок, формы, исполнение, история и AI-помощник.',1016,1010,400,'container',270);
 box(s,'telegram','Telegram','[External Software System]','Диалоги, групповые заявки и уведомления через Telegram-бота.',1976,330,360,'external');
 box(s,'smtp','Почтовый сервис','[External Software System]','Отправляет приглашения и ссылки активации аккаунтов.',1976,790,360,'external');
 box(s,'llm','OpenRouter','[External Software System]','LLM для анализа заявок, подбора форм и подготовки этапов / ТЗ.',1976,1250,360,'external');
 box(s,'geo','DaData / Яндекс.Карты','[External Software System]','Подсказки адресов, геоданные и карта в полях формы.',1976,1710,360,'external');
 edge(s,'owner','svod','Управляет формами,\nзаявками и участниками','RIGHT','LEFT',false,true);
 edge(s,'member','svod','Работает с заявками\nи этапами','RIGHT','LEFT',false,true);
 edge(s,'applicant','svod','Отправляет заявку\nчерез веб-форму','RIGHT','LEFT',false,true);
 edge(s,'contractor','svod','Передаёт результат\nчерез ответственного','RIGHT','LEFT',false,true);
 edge(s,'svod','telegram','Принимает сообщения;\nотправляет карточки и уведомления','RIGHT','LEFT',false,true);
 edge(s,'svod','smtp','Отправляет приглашения','RIGHT','LEFT',false,true);
 edge(s,'svod','llm','Запрашивает AI-обработку','RIGHT','LEFT',false,true);
 edge(s,'svod','geo','Получает подсказки\nи геоданные','RIGHT','LEFT',false,true);
 const plan=section(s,'',64,2220,2272,640,'FFFBF0');text(plan,'Планируемые взаимодействия',32,24,2208,28,true);text(plan,'Эти возможности сохранены из исходной схемы и пока отсутствуют в коде проекта.',32,70,2208,20,false,C.muted);
 box(plan,'crm','Внутренняя CRM','[Software System · Планируется]','Клиенты, сделки, обращения, тарифы и оплаты организаций.',80,200,450,'plan');
 box(plan,'manager','Менеджер по работе с клиентами','[Person · Планируется]','Ведёт клиентов и сделки во внутренней CRM.',880,200,450,'person');
 box(plan,'mail','Приём заявок из почты','[Integration · Планируется]','Письма преобразуются в структурированные заявки СВОД.',1680,200,500,'plan');
 edge(plan,'manager','crm','Ведёт клиентов\nи обращения','LEFT','RIGHT',true);
 edge(s,'svod','crm','Обменивается данными\n[Планируется]','BOTTOM','TOP',true);
 text(plan,'CRM ↔ СВОД: организации, тарифы, статусы подписок и оплаты.\nПочта → СВОД: импорт входящих писем. Протоколы уточняются при реализации.',80,510,2100,20,false,C.muted);
 legend(s,2930,2400);
}
if(LEVEL==='container'){
 const s=section(wrapper,'02 · Container',2528,320,3000,3080);header(s,'02','Контейнеры','Исполняемые приложения и хранилища. Кабинет и публичные формы входят в одну SPA.',3000);
 const b=section(s,'СВОД · Software System',480,310,2020,1820,C.boundary);text(b,'Граница системы СВОД',32,24,1850,24,true);
 box(s,'owner','Администратор / исполнитель','[Person]','Формы, заявки, участники и выполнение работ.',64,430,340,'person');
 box(s,'applicant','Заявитель','[Person]','Публичная веб-форма и Telegram.',64,1110,340,'person');
 box(b,'spa','Веб-приложение СВОД','[Container: React / TypeScript]','Кабинет организации + публичные формы. Конструктор, заявки и AI-панели.',100,160,440);
 box(b,'api','API СВОД','[Container: Python / FastAPI]','REST API, аутентификация, организации, формы, заявки и интеграции.',100,780,440);
 box(b,'bot','Telegram-бот','[Container: Python / aiogram 3]','Long polling, личные и групповые заявки, карточки и доставка уведомлений.',1330,160,440);
 box(b,'worker','Фоновый worker','[Container: Python / asyncio]','Обрабатывает AI jobs из PostgreSQL. Проверяет просроченные этапы.',750,780,440);
 box(b,'db','База данных СВОД','[Container: PostgreSQL 16]','Организации, пользователи, формы, заявки, этапы, AI jobs, Telegram и уведомления.',650,1380,530,'db',280);
 box(b,'storage','Файловое хранилище','[Container: S3 / локальные файлы]','Вложения заявок и артефакты этапов. Режим зависит от конфигурации.',1390,1380,470,'db',280);
 box(s,'telegram','Telegram','[External Software System]','Bot API: сообщения, файлы и уведомления.',2560,430,376,'external');
 box(s,'llm','OpenRouter','[External Software System]','LLM для AI-функций СВОД.',2560,1040,376,'external');
 box(s,'smtp','Почтовый сервис','[External Software System]','Исходящие приглашения и активация аккаунтов.',2560,1650,376,'external');
 edge(s,'owner','spa','Работает в кабинете\n[HTTPS]','RIGHT','LEFT');
 edge(s,'applicant','spa','Отправляет форму\n[HTTPS]','RIGHT','LEFT');
 edge(b,'spa','api','Вызывает REST API\n[JSON / HTTP(S)]','BOTTOM','TOP');
 edge(b,'api','db','Читает / записывает\n[SQLAlchemy / asyncpg]','BOTTOM','LEFT');
 edge(b,'worker','db','Забирает AI jobs;\nсохраняет результаты [SQL]','BOTTOM','TOP');
 edge(b,'bot','db','Использует общие сервисы\nи БД напрямую [SQL]','BOTTOM','RIGHT');
 edge(b,'api','storage','Загружает файлы;\nвыдаёт ссылки [S3 API / FS]','RIGHT','LEFT');
 edge(s,'bot','telegram','Получает updates,\nотправляет сообщения\n[Bot API / HTTPS]','RIGHT','LEFT');
 edge(s,'worker','llm','Запрашивает AI-обработку\n[JSON / HTTPS]','RIGHT','LEFT');
 edge(s,'api','llm','Синхронные AI-запросы\n[JSON / HTTPS]','RIGHT','TOP');
 edge(s,'api','smtp','Отправляет приглашения\n[SMTP / TLS]','BOTTOM','LEFT');
 text(b,'Процессы API, worker и бот используют общий Python-код сервисов.\nОчередь AI jobs и outbox уведомлений хранятся в PostgreSQL; отдельного брокера нет.',32,1710,1956,20,false,C.muted);
 text(s,'Дополнительная интеграция: SPA загружает Яндекс.Карты JS API; API проксирует DaData / Яндекс Suggest [HTTPS].\nNGINX обслуживает SPA и проксирует /api. Развёртывание: Docker Compose; миграции: Alembic.',64,2200,2872,20,false,C.muted);
 const plan=section(s,'',64,2380,2872,510,'FFFBF0');text(plan,'Планируется / отдельная внутренняя CRM и почтовый импорт',32,24,2808,28,true);
 box(plan,'mail','Импорт почты','[Container · Планируется]','Письмо → заявка СВОД.',32,145,380,'plan',190);
 box(plan,'sync','Синхронизация CRM ↔ СВОД','[Container · Планируется]','Регистрации, тарифы, активность и оплаты организаций.',580,145,440,'plan',190);
 box(plan,'crmapi','Бэкенд CRM','[Container: Python · Планируется]','Клиенты, сделки, подписки и обращения.',1220,145,440,'plan',190);
 box(plan,'crmweb','Веб-приложение CRM','[Container: JS · Планируется]','Рабочее место менеджера.',1860,145,400,'plan',190);
 box(plan,'crmdb','БД CRM','[Container: PostgreSQL · Планируется]','Клиенты, сделки, подписки.',2410,145,400,'plan',190);
 edge(plan,'sync','crmapi','Обмен данными','RIGHT','LEFT',true);
 edge(plan,'crmweb','crmapi','REST API','LEFT','RIGHT',true);
 edge(plan,'crmapi','crmdb','Читает / записывает [SQL]','BOTTOM','BOTTOM',true);
 text(plan,'Связи со СВОД: импорт почты → API; сервис синхронизации ↔ API СВОД. CRM API → БД CRM [SQL].',32,423,2808,18,false,C.muted);
 legend(s,2950,3000);
}
if(LEVEL==='component'){
 const s=section(wrapper,'03 · Component',5592,320,3760,3080);header(s,'03','Компоненты API СВОД','Детализация контейнера API (FastAPI). Компоненты сгруппированы по ответственности.',3760);
 box(s,'spa','Веб-приложение СВОД','[Container: React / TypeScript]','Кабинет организации и публичные формы.',1570,235,560,'container',190);
 box(s,'storage','Файловое хранилище','[Container: S3 / локальная FS]','Вложения и артефакты этапов.',2816,235,800,'db',190);
 const b=section(s,'API СВОД · Container: Python / FastAPI',64,660,3632,1730,C.boundary);text(b,'Граница контейнера API СВОД',32,24,3568,24,true);
 box(b,'router','HTTP API и зависимости','[Component: FastAPI routers / deps]','Маршрутизация, Pydantic DTO, JWT пользователя и AsyncSession. app/api + core/security.',1160,100,1260,'component',190);
 const col=[64,960,1856,2752];
 box(b,'identity','Аккаунты и организации','[Component: Python services]','Регистрация, JWT, участники, приглашения и вступление. auth / organization / join_request_service.',col[0],525,800,'component',220);
 box(b,'forms','Формы и публичный приём','[Component: Python services]','Схемы форм, публичные ссылки, валидация и создание заявок. form / public_link_service.',col[1],525,800,'component',220);
 box(b,'workflow','Заявки и исполнение','[Component: Python services]','Жизненный цикл, права, этапы, задачи и история. request_* / stage_*_service.',col[2],525,800,'component',220);
 box(b,'files','Файлы и артефакты','[Component: Python services]','Загрузка, метаданные, доступ и результат этапа. file / stage_artifact / storage_service.',col[3],525,800,'component',220);
 box(b,'notifications','Уведомления и почта','[Component: Python services]','Создаёт уведомления и outbox; отправляет приглашения. notification_service + email_service.',col[0],1040,800,'component',220);
 box(b,'ai','AI-оркестрация','[Component: Python services / HTTPX]','Анализ, подбор форм, план этапов и ТЗ; постановка jobs. ai_job / request_* / openrouter_client.',col[1],1040,800,'component',220);
 box(b,'tglink','Привязка Telegram','[Component: Python services]','Одноразовый link-token и связь аккаунтов; выдача источника заявки. telegram_link / suggestion_service.',col[2],1040,800,'component',220);
 box(b,'geo','Адресные подсказки','[Component: Python / HTTPX]','Проксирует запросы к провайдерам адресов. address_suggest_service.',col[3],1040,800,'component',220);
 box(b,'persistence','Доступ к данным','[Component: SQLAlchemy / asyncpg]','repositories + models + core/database. Также прямые ORM-запросы из сервисов.',1856,1480,800,'component',180);
 edge(s,'spa','router','Вызывает REST API\n[JSON / HTTP(S), Bearer JWT; публичные token-ссылки]','BOTTOM','TOP');
 for(let i=0;i<4;i++)edge(b,'router',['identity','forms','workflow','files'][i],['/auth · /organizations · /join','/forms · /public/request','/requests','/files · файлы этапов'][i],'BOTTOM','TOP',false,true,{x:(i+.5)/4,y:1});
 edge(b,'identity','notifications','Создаёт приглашения\n[Python call]','BOTTOM','TOP',false,true);
 edge(b,'forms','ai','Подбирает форму /\nобогащает заявку [Python call]','BOTTOM','TOP',false,true);
 edge(b,'workflow','ai','Анализ, план, ТЗ; jobs\n[Python call]','BOTTOM','RIGHT');
 edge(b,'workflow','notifications','События исполнения\n[Python call]','LEFT','RIGHT');
 edge(b,'router','tglink','/telegram','RIGHT','TOP');
 edge(b,'router','geo','/suggest','RIGHT','TOP');
 edge(b,'ai','persistence','Сохраняет jobs и AI-результаты\n[ORM]','BOTTOM','TOP');
 edge(b,'tglink','persistence','Аккаунты / источник\n[ORM]','BOTTOM','TOP');
 text(b,'Все доменные сервисы используют общий слой данных. Для читаемости показаны основные вызовы; CRUD-связи к ORM сведены в один компонент.',64,1690,3504,18,false,C.muted);
 box(s,'smtp','Почтовый сервис','[External Software System]','Приглашения и активация.',128,2590,800,'external',190);
 box(s,'llm','OpenRouter','[External Software System]','Генерация и анализ LLM.',1024,2590,800,'external',190);
 box(s,'db','PostgreSQL 16','[Container]','Доменные данные, AI jobs и outbox.',1920,2590,800,'db',190);
 box(s,'externalgeo','DaData / Яндекс Suggest','[External Software System]','Подсказки адресов.',2816,2590,800,'external',190);
 edge(s,'notifications','smtp','Отправляет письма\n[SMTP / TLS]','BOTTOM','TOP');
 edge(s,'ai','llm','Вызывает LLM\n[JSON / HTTPS]','BOTTOM','TOP');
 edge(s,'persistence','db','Читает / записывает\n[asyncpg / SQL]','BOTTOM','TOP');
 edge(s,'geo','externalgeo','Запрашивает подсказки\n[JSON / HTTPS]','BOTTOM','TOP');
 edge(s,'files','storage','Загружает / удаляет;\nвыдаёт URL [S3 API / FS]','TOP','BOTTOM');
 text(s,'Файлы → S3 API / локальная FS: storage_service.\nTelegram-бот и worker — отдельные контейнеры: импортируют общие сервисы и обращаются к БД напрямую, без HTTP-вызова API.',64,2860,3632,20,false,C.muted);
 legend(s,2980,3760);
}
measure.remove();
return {level:LEVEL,wrapperId:wrapper.id,createdNodeIds:ids,sections:wrapper.children.filter(n=>n.type==='SECTION').map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),refs:Object.fromEntries(Object.entries(refs).map(([k,n])=>[k,n.id]))};
