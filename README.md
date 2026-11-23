# StoryVerse Frontend

เว็บแอปพลิเคชันสำหรับอ่านและเขียนนิยาย พัฒนาด้วย React และ Vite โดยมีหน้าสำหรับนักอ่าน นักเขียน และผู้ดูแลระบบ

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมี

- Node.js และ npm
- Backend ที่ทำงานอยู่ที่ `http://localhost:8080` หากต้องการใช้ฟังก์ชันที่เชื่อมต่อข้อมูลจาก API

### ติดตั้งและเปิดโหมดพัฒนา

เปิดเทอร์มินัลที่โฟลเดอร์โปรเจกต์ แล้วรัน:

```bash
npm install
npm run dev
```

จากนั้นเปิด URL ที่ Vite แสดงในเทอร์มินัล โดยปกติจะเป็น `http://localhost:5173`

เซิร์ฟเวอร์จะรีโหลดหน้าเว็บอัตโนมัติเมื่อมีการแก้ไขโค้ด หากต้องการหยุด ให้กด `Ctrl+C` ในเทอร์มินัล

### คำสั่งอื่น

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `npm run dev` | เปิดเซิร์ฟเวอร์สำหรับพัฒนา |
| `npm run build` | สร้างไฟล์สำหรับนำไปเผยแพร่ไว้ใน `dist/` |
| `npm run preview` | ทดลองเปิดไฟล์ที่สร้างจาก build ในเครื่อง |
| `npm run lint` | ตรวจรูปแบบและปัญหาเบื้องต้นของโค้ดด้วย ESLint |

### การเชื่อมต่อ Backend

ค่า URL ของ API หลักตั้งต้นเป็น `http://localhost:8080` และสามารถกำหนดใหม่ด้วยตัวแปร `VITE_API_BASE_URL` เช่น สร้างไฟล์ `.env.local` ที่โฟลเดอร์หลัก:

```env
VITE_API_BASE_URL=http://localhost:8080
```

ในโหมดพัฒนา Vite ตั้ง proxy สำหรับคำขอที่ขึ้นต้นด้วย `/api` ให้ส่งต่อไปยัง `http://localhost:8080` ด้วย หากเปลี่ยนที่อยู่ Backend ให้ตรวจทั้งค่าตัวแปรและ `server.proxy` ใน `vite.config.js` ให้ตรงกับสภาพแวดล้อมที่ใช้งาน

## โครงสร้างโปรเจกต์

```text
novel-FE/
├── public/                 ไฟล์สาธารณะที่อ้างอิงด้วย URL ตรง ๆ
├── src/                    ซอร์สโค้ดของแอป
│   ├── components/         คอมโพเนนต์ที่ใช้ซ้ำในหลายหน้า
│   ├── data/               ข้อมูลตัวอย่างสำหรับหน้าจอ
│   ├── hooks/              React hooks ที่ใช้ร่วมกัน
│   ├── pages/              หน้าต่าง ๆ ของแอป แยกตามประเภทผู้ใช้
│   ├── style/              CSS ส่วนกลางและระบบออกแบบ
│   ├── utils/              ฟังก์ชันช่วยเหลือทั่วไป
│   ├── App.jsx             การจัดการเส้นทางและ layout หลัก
│   └── main.jsx            จุดเริ่มต้นที่นำ React ไปแสดงในหน้าเว็บ
├── index.html              HTML หลักที่ Vite ใช้เปิดแอป
├── package.json            dependencies และคำสั่ง npm
├── package-lock.json       เวอร์ชัน dependencies ที่ติดตั้งให้ตรงกัน
├── vite.config.js          ตั้งค่า Vite, React และ API proxy
├── tailwind.config.js      กำหนดไฟล์ที่ Tailwind ใช้ค้นหา class
├── eslint.config.js        กฎการตรวจโค้ดด้วย ESLint
└── eslint_report.json      รายงานผล ESLint ที่มีอยู่ใน repository
```

### ไฟล์และโฟลเดอร์สำคัญ

#### `src/`

- **`main.jsx`** — สร้าง React root ที่ element `#root` และโหลด `App.jsx`
- **`App.jsx`** — กำหนดเส้นทางหน้าเว็บ, layout ของนักอ่าน/นักเขียน/ผู้ดูแลระบบ และการเชื่อมต่อหน้าต่าง ๆ
- **`components/`** — ชิ้นส่วน UI ที่นำกลับมาใช้ซ้ำได้ ส่วนใหญ่แต่ละคอมโพเนนต์มีไฟล์ `.jsx` สำหรับโครงสร้างและการทำงาน กับไฟล์ `.css` สำหรับรูปแบบ เช่น การ์ดนิยาย เมนูนำทาง ปุ่ม และหน้าต่างแจ้งเตือน
- **`pages/`** — แต่ละโฟลเดอร์ย่อยแทนหน้าหรือกลุ่มหน้าหนึ่งส่วน โดยไฟล์ `.jsx` เป็นเนื้อหาและการทำงานของหน้า ส่วนไฟล์ `.css` กำหนดรูปแบบเฉพาะหน้านั้น
- **`style/`** — CSS ที่ใช้ร่วมกันทั้งแอป:
  - `DesignSystem.css` — ตัวแปรสี ฟอนต์ ระยะห่าง และค่าออกแบบกลาง
  - `App.css` — reset และสไตล์พื้นฐาน/ส่วนกลางของแอป
  - `index.css` — สไตล์พื้นฐานของ root และคลาสฟอนต์
- **`utils/`** — ฟังก์ชันกลางที่ไม่ผูกกับหน้าใดหน้าหนึ่ง:
  - `apiFetch.js` — ส่งคำขอ API และลองเส้นทางสำรองในกรณีที่ได้สถานะ 400 หรือ 404
  - `avatarService.js` — งานเกี่ยวกับรูปโปรไฟล์
  - `choiceValidation.js` — ตรวจสอบความถูกต้องของเส้นทางตัวเลือกและโครงสร้างฉาก
  - `cropImage.js` — ครอบตัดรูปภาพและเตรียมไฟล์สำหรับอัปโหลด
  - `novelStatus.js` — ฟังก์ชันเกี่ยวกับสถานะนิยาย
  - `stripHtml.js` — แปลงข้อความ HTML ให้เป็นข้อความธรรมดา
  - `toast.js` — แสดงข้อความแจ้งเตือนแบบ toast
- **`hooks/useNavbar.jsx`** — hook สำหรับพฤติกรรมที่เกี่ยวกับแถบนำทาง
- **`data/mockwriterdata.js`** — ข้อมูลตัวอย่างฝั่งนักเขียน ใช้แทนข้อมูลจาก API ในส่วนที่ยังใช้ mock data

โฟลเดอร์ย่อยใน `components/` แบ่งตามหน้าที่ของ UI:

- **ส่วนที่เกี่ยวกับนิยายและการอ่าน:** `CategoryCard/`, `NovelCard/`, `NovelCoverCard/`, `NovelProgressBar/`, `GenreTag/`, `ReadingSettings/`, `Readingbreadcrumb/`, `RestartReadingButton/`, `ReaderReportButton/`, `Choicebuttons/`, `EndingCollection/`, `EndingSettings/`, `EndingUnlockedModal/`, `Comments/`
- **ส่วนที่เกี่ยวกับผู้ใช้และการนำทาง:** `Navbar/`, `NavbarAdmin/`, `Navbarwriter/`, `WriterCard/`, `FollowButton/`, `Notification/`, `NotificationDropdown/`, `AdminModeBanner/`
- **ส่วนควบคุมและแสดงสถานะ:** `ActionButtons/`, `Coverupload/`, `Multiselect/`, `LoadingScreen/`, `Skeleton/`, `StatBadge/`, `Toggle/`, `UnsavedChangesModal/`

ภายในโฟลเดอร์เหล่านี้ ชื่อไฟล์ `.jsx` คือคอมโพเนนต์ และไฟล์ `.css` ที่ชื่อคู่กันคือสไตล์ของคอมโพเนนต์นั้น ส่วน `Skeleton/index.js` เป็นไฟล์รวมจุด export ของคอมโพเนนต์ Skeleton

#### หน้าต่าง ๆ ใน `src/pages/`

- **`Auth/`** — เข้าสู่ระบบ/สมัครบัญชี และลงทะเบียนนักเขียน
- **`Reader/`** — หน้าสำหรับนักอ่าน:
  - `HomePage/` — หน้าแรก
  - `NovelDetailPage/` — รายละเอียดนิยาย
  - `Readingpage/` — อ่านเนื้อหา
  - `CategoriesPage/` และ `SearchPage/` — เลือกหมวดหมู่และค้นหานิยาย
  - `BookshelfPage/`, `HistoryPage/` และ `FollowingWriters/` — ชั้นหนังสือ ประวัติการอ่าน และนักเขียนที่ติดตาม
  - `NotificationPage/` และ `ReaderSetting/` — การแจ้งเตือนและการตั้งค่าผู้อ่าน
  - `Storytreepage/` — ดูแผนผังเส้นทาง/ฉากของเรื่อง
- **`Writer/`** — เครื่องมือสำหรับนักเขียน:
  - `Writerdashboardpage/` — แดชบอร์ด
  - `Createnovelpage/` และ `EditNovelPage/` — สร้างและแก้ไขนิยาย
  - `Chaptermanagerpage/` — จัดการตอน
  - `Sceneeditorpage/` และ `Writerstorytreepage/` — แก้ไขฉากและจัดการแผนผังเรื่อง
  - `WriterProfile/` และ `StatisticsGraph/` — โปรไฟล์และสถิติ
- **`Admin/`** — เครื่องมือผู้ดูแลระบบ:
  - `AdminDashboardPage/` — แดชบอร์ด
  - `Manageusers/` — จัดการผู้ใช้
  - `WriterRequestsPage/` — คำขอสมัครเป็นนักเขียน
  - `AdminCategoryPage/` — จัดการหมวดหมู่
  - `AdminReportsDashboard/` — รายงาน
  - `Adminauditlog/` — ประวัติการทำรายการ

#### โฟลเดอร์และไฟล์ระดับบนสุด

- **`public/`** — ไฟล์ที่นำไปใช้ได้โดยตรง เช่น `favicon.ico` และรูปโลโก้
- **`index.html`** — กำหนด HTML ตั้งต้น ชื่อหน้า ฟอนต์ และ element ที่ React ใช้แสดงผล
- **`package.json` / `package-lock.json`** — รายการ dependencies และสคริปต์ที่ใช้จัดการโปรเจกต์
- **`vite.config.js`** — ตั้งค่า Vite และ proxy สำหรับ `/api`
- **`tailwind.config.js`** — ระบุไฟล์ซอร์สที่ Tailwind ใช้ตรวจหา class
- **`eslint.config.js`** — ตั้งค่ากฎ lint
- **`dist/`** — ไฟล์ build ที่สร้างขึ้นจาก `npm run build` ไม่ใช่โฟลเดอร์ซอร์สที่แก้ไขเป็นหลัก
- **`node_modules/`** — dependencies ที่ติดตั้งด้วย `npm install` ไม่ควรแก้ไขไฟล์ในโฟลเดอร์นี้โดยตรง

## แนวทางแก้ไขโค้ด

- ถ้าต้องการเปลี่ยนหน้าหนึ่งหน้า ให้เริ่มจากไฟล์ใน `src/pages/` และดูไฟล์ CSS ในโฟลเดอร์เดียวกัน
- ถ้าต้องการแก้ UI ที่ใช้ซ้ำหลายหน้า ให้ตรวจคอมโพเนนต์ใน `src/components/`
- ถ้าต้องการเพิ่มหน้าใหม่ ให้เพิ่ม page component และสไตล์ที่เกี่ยวข้อง แล้วกำหนดเส้นทางใน `src/App.jsx`
- ถ้าต้องการเพิ่มฟังก์ชันช่วยเหลือที่ใช้ร่วมกัน ให้พิจารณาวางไว้ใน `src/utils/`
