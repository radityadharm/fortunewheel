# 🎡 Fortune Wheel — Undian Nama

Aplikasi roda undian: masukkan nama, putar rodanya, dan pemenangnya dirayakan
dengan confetti. Bisa menyimpan beberapa roda untuk dipakai lagi, dan bisa
menjalankan **dua roda sekaligus** dengan isi yang berbeda.

Situs statis murni — tanpa framework, tanpa dependency, tanpa proses build.

## Fitur

| Fitur | Keterangan |
| --- | --- |
| **Input nama** | Satu per satu (Enter) atau sekaligus lewat tempel banyak baris. **Pemisahnya hanya baris baru**, jadi koma aman dipakai untuk gelar — `Andi Wijaya, S.Kom., M.T.` tetap satu peserta. Nama kembar otomatis ditolak. |
| **Tahan untuk berputar** | Tahan tombol **PUTAR** (mouse, sentuh, atau <kbd>Spasi</kbd>) — roda berputar terus selama ditahan. Begitu dilepas, barulah pemenang diundi dan rodanya direm sampai berhenti di segmen itu. Klik singkat tetap menghasilkan putaran biasa. |
| **Confetti** | Ledakan confetti + suara singkat tiap kali pemenang keluar. Di mode dua roda, confetti dikurung di kolom rodanya masing-masing sehingga perayaan roda kiri dan kanan terpisah. |
| **Hapus pemenang** | Tombol *Hapus dari roda* di kartu pemenang agar tidak menang dua kali — lengkap dengan tombol *Kembalikan* kalau salah pencet. |
| **Tampil tapi tidak diundi** | Untuk peserta yang sudah sering menang: namanya **tetap tampil di roda** tapi tidak akan pernah terpilih. Atur lewat tombol ⊘ di daftar nama atau tombol *Tidak ikut lagi* di kartu pemenang. Bisa dibatalkan satu per satu, atau sekaligus lewat **ikutkan semua lagi**. Penandaannya (abu-abu, dicoret) **hanya muncul di halaman moderasi** — di layar peserta orangnya tampil sama rata dengan yang lain. |
| **Mahkota pemenang** | Peserta yang sudah pernah menang diberi 👑 di kedua halaman. Inilah yang membedakan "dicantumkan tapi tidak diundi" dari "sudah dapat hadiah". Mahkotanya hilang kalau riwayat pemenang dibersihkan. |
| **Cari peserta** | Kolom pencarian muncul di daftar begitu ada 10 nama atau lebih, lengkap dengan penghitung hasil. |
| **Setelah menang** | Satu pilihan per roda: pemenang *tetap di roda*, *hapus dari roda*, atau *tidak ikut lagi* secara otomatis. |
| **Roda tersimpan** | Simpan daftar nama dengan sebuah nama roda, lalu muat lagi kapan saja — status *tidak diundi* ikut tersimpan. Bisa ditimpa, diduplikat, dihapus, diekspor/impor JSON. |
| **Database (opsional)** | Kalau Upstash Redis dipasang di Vercel, roda tersimpan naik ke database sehingga bisa dibuka dari perangkat lain dan tidak hilang saat data browser dibersihkan. Membaca terbuka; menyimpan/menghapus perlu **kode admin**. Tanpa database, aplikasi tetap jalan penuh dengan penyimpanan browser. |
| **Dua roda** | Ganti ke mode *2 Roda* untuk menjalankan roda kedua dengan isi berbeda (mis. peserta × hadiah). Bisa diputar sendiri-sendiri atau bareng lewat **Putar semua**. Kartu hasil selalu menampilkan pemenang terakhir dari **kedua** roda — memutar roda 2 tidak menghapus pemenang roda 1 — dan yang baru saja diundi diberi tanda *baru saja*. |
| **Layar peserta** | Halaman `slide.html` untuk diproyeksikan ke layar besar: **rodanya ikut berputar** mengikuti moderator, daftar peserta berukuran besar yang **bergulir sendiri** kalau namanya tidak muat, pengumuman pemenang layar penuh dengan confetti, dan daftar pemenang sejauh ini. Bisa dibuka di tab lain pada browser yang sama, atau **di perangkat lain lewat tautan peserta** kalau database aktif. Dengan dua roda, papannya ditumpuk atas–bawah dan confetti tiap roda tinggal di pitanya sendiri. |
| **Riwayat** | Daftar pemenang per roda beserta jamnya. |
| **Tersimpan otomatis** | Semua isi roda, mode, dan pengaturan disimpan di `localStorage` browser. |

Pelengkap: acak urutan, ganti nama roda, matikan suara, <kbd>Esc</kbd> untuk
menutup dialog, dan tampilan menyesuaikan layar ponsel. Sudah diuji lancar
dengan 200+ peserta dalam satu roda.

## Layar peserta (halaman slide)

Layar untuk penonton: roda besar yang ikut berputar, daftar peserta, dan
pengumuman pemenang. Ada dua cara membukanya.

**Di perangkat yang sama** — klik **Layar peserta** di kanan atas (atau buka
`slide.html`). Tab itu mengikuti halaman roda lewat `BroadcastChannel` +
`localStorage`, cocok untuk laptop yang dicolok ke proyektor. Tidak perlu
database.

**Di perangkat lain** — butuh database yang aktif (lihat bagian berikutnya):

1. Klik **Layar peserta** di kanan atas; panelnya terbuka di kotak *Layar peserta*.
2. Masukkan **kode admin** di kotak *Database* tepat di bawahnya.
3. Klik **Buat tautan peserta**, lalu **Salin**. Tautannya berbentuk
   `…/slide.html?s=xxxxxxxxxxxx` — kode di belakang itulah alamat sesinya.
4. Buka tautan tersebut di komputer/TV/tablet mana pun.

Tombol **Buka di perangkat ini** sengaja tanpa kode: itu jalan pintas untuk tab
lain di browser yang sama, bukan tautan yang bisa dibagikan.

### Kalau tombol "Buat tautan peserta" tidak muncul

Kotak *Layar peserta* selalu menyebutkan penyebabnya. Urutan pemeriksaannya:

| Yang tertulis | Artinya | Perbaikannya |
| --- | --- | --- |
| menyebut folder `api/` | situs dibuka dari berkas lokal atau hosting statis biasa | deploy ke Vercel, karena tautan peserta perlu bagian server |
| menyebut Upstash | fungsi servernya jalan, tapi Redis belum tersambung | Vercel → Storage → Marketplace → Upstash (Redis) → Connect to Project |
| menyebut `ADMIN_CODE` | database siap, tapi belum ada kode admin | Vercel → Settings → Environment Variables → tambah `ADMIN_CODE`, lalu deploy ulang |
| meminta kode admin | semuanya siap, tinggal masuk | masukkan kodenya di kotak *Database* |

Untuk memastikan sisi servernya, buka `https://alamat-situsmu/api/wheels` di
browser. Jawaban `{"enabled":true,"canWrite":true,…}` berarti database dan kode
admin sudah beres.

Perangkat peserta hanya menyimak: ia membaca sesi dari database dan tidak
pernah bisa menulis apa pun — memutar roda, mengubah nama, atau menyimpan
tetap perlu kode admin di halaman moderator. Tautan bisa dimatikan kapan saja
lewat **Matikan tautan**, dan sesinya juga hangus sendiri setelah 12 jam.

Putaran ikut tersinkron karena yang dikirim bukan gambar, melainkan *rencana*
putaran (rotasi awal, rotasi akhir, durasi) beserta stempel waktu dari server.
Layar peserta menjalankan rencana yang sama; kalau pesannya baru sampai di
tengah putaran, animasinya menyusul dari posisi yang seharusnya, bukan
mengulang dari awal. Jadi roda di kedua layar berhenti di segmen yang sama
persis.

## Database roda tersimpan (opsional)

Tanpa disetel pun aplikasi jalan penuh — roda tersimpan di browser masing-masing.
Setelah database dipasang, roda bisa dibuka dari perangkat mana saja.

**1. Pasang Upstash Redis**

Di dashboard Vercel: **Storage → Marketplace → Upstash (Redis) → Connect to
Project**. Env `KV_REST_API_URL` dan `KV_REST_API_TOKEN` masuk otomatis (nama
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` juga dikenali).

**2. Isi kode admin**

**Settings → Environment Variables → Add**: `ADMIN_CODE`, isi dengan kata sandi
acak yang panjang. Selama env ini kosong, API sengaja **hanya-baca** supaya
database tidak pernah terbuka untuk umum karena lupa disetel.

**3. Deploy ulang**, lalu buka **Roda tersimpan** di aplikasi dan masukkan kode
admin sekali di perangkat itu.

Siapa boleh apa:

| | Membaca & memuat roda | Menyimpan, menimpa, menghapus |
| --- | --- | --- |
| Pengunjung biasa | ✅ | ❌ |
| Sudah masukkan kode admin | ✅ | ✅ |

Kode admin disimpan di `localStorage` browser yang memasukkannya, dan dikirim
sebagai header `x-admin-code` pada setiap penulisan. Karena itu pakai kode yang
panjang dan acak, jangan dipasang di komputer umum, dan ganti env-nya kalau
bocor (semua perangkat otomatis diminta memasukkan kode lagi).

Endpoint `api/wheels.js`:

| Metode | Guna | Perlu kode |
| --- | --- | --- |
| `GET /api/wheels` | status database + daftar roda | tidak |
| `POST /api/wheels` | memeriksa kode admin | — |
| `PUT /api/wheels` | menyimpan/memperbarui satu roda | ya |
| `DELETE /api/wheels?id=…` | menghapus satu roda | ya |
| `GET /api/live?s=…` | membaca sesi layar peserta | tidak |
| `PUT /api/live?s=…` | menyiarkan keadaan roda + putaran | ya |
| `DELETE /api/live?s=…` | mematikan sesi | ya |

Batas yang dijaga server: 200 roda, 300 nama per roda, 60 karakter per nama.
Roda tersimpan ada di satu hash Redis (`fortunewheel:wheels`, ubah lewat env
`FW_REDIS_KEY`), sedangkan tiap sesi layar peserta jadi satu key
`fortunewheel:live:<id>` (prefiks lewat `FW_LIVE_PREFIX`) yang kedaluwarsa
sendiri setelah 12 jam.

Layar peserta menarik data tiap ~1,2 detik selama tabnya terlihat, dan jauh
lebih jarang saat tersembunyi — satu sesi undian sejam hanya memakai sekitar
3.000 perintah Redis, masih lapang untuk paket gratis Upstash.

## Menjalankan di komputer sendiri

Cara tercepat — buka langsung berkasnya:

```
buka index.html di browser
```

Atau lewat server lokal (disarankan, supaya perilakunya sama persis dengan versi online):

```bash
npm run dev          # butuh Node.js
# atau
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Deploy ke Vercel

Repo ini sudah siap deploy — `vercel.json` mengatur agar Vercel menyajikan
berkas apa adanya tanpa proses build.

**Lewat dashboard (paling gampang)**

1. Buka [vercel.com/new](https://vercel.com/new), lalu impor repositori ini.
2. Framework Preset: **Other**. Build Command dan Install Command dibiarkan
   kosong, Output Directory `.` — semuanya sudah diisi otomatis dari `vercel.json`.
3. Klik **Deploy**. Setiap push ke branch utama akan otomatis dideploy ulang.

**Lewat CLI**

```bash
npx vercel          # deploy pratinjau
npx vercel --prod   # deploy ke domain produksi
```

Tanpa environment variable apa pun, situs langsung jalan dengan penyimpanan
browser. Untuk menyimpan roda di database lintas perangkat, lihat bagian
**Database roda tersimpan** di atas.

## Struktur berkas

```
index.html        kerangka halaman + template panel roda
css/styles.css    seluruh tampilan
js/storage.js     baca/tulis localStorage (dengan cadangan di memori)
js/sync.js        siaran antar tab (BroadcastChannel + cadangan storage event)
js/sound.js       bunyi "tek" dan fanfare via Web Audio API
js/confetti.js    animasi confetti di canvas layar penuh
js/wheel.js       gambar roda + animasi putaran
js/app.js         state aplikasi, dua panel roda, modal pemenang, roda tersimpan
js/cloud.js       klien database (aman diabaikan kalau API tidak ada)
api/wheels.js     Serverless Function: baca/tulis roda di Upstash Redis
api/live.js       Serverless Function: sesi langsung untuk layar peserta
slide.html        layar peserta untuk diproyeksikan
css/slide.css     tampilan layar peserta
js/slide.js       isi layar peserta + pengumuman pemenang
vercel.json       konfigurasi deploy statis
```

## Catatan teknis

Pemenang ditentukan lebih dulu memakai `crypto.getRandomValues` — hanya dari
segmen yang ikut diundi — baru rotasi akhir roda dihitung agar segmen itu
benar-benar berhenti tepat di bawah jarum. Jadi yang terlihat di layar selalu
sama dengan yang diumumkan, dan nama bertanda *tidak diundi* memang tidak
pernah bisa berhenti di jarum. Saat tombolnya ditahan, undiannya baru dilakukan
pada detik tombol dilepas.

Daftar nama di layar peserta digulung dengan menggandakan isinya lalu
menggesernya setengah tinggi — perulangannya jadi mulus tanpa lompatan. Layar
itu juga hanya membangun ulang daftarnya kalau isinya benar-benar berubah;
kalau tidak, animasi gulungannya akan mengulang dari awal tiap kali data
ditarik. Penonton yang baru membuka tautan langsung melihat keadaan terkini
tanpa mengulang pengumuman undian yang sudah lewat.

Roda digambar sekali ke canvas bayangan, lalu tiap frame cukup diputar dan
disalin — bukan menggambar ulang ratusan juring beserta teksnya. Dengan 200
nama, biaya menggambar per frame turun dari ~1,6 ms jadi ~0,04 ms (sekitar 40×
lebih ringan; anggaran 60 fps adalah 16,7 ms per frame). Dua hal lain ikut
membantu: label dilewati kalau juringnya terlalu tipis untuk terbaca, dan bunyi
"tek" dikelompokkan supaya lajunya tetap wajar berapa pun jumlah namanya —
tanpa itu, 200 juring berarti 240 bunyi per detik.

Batas praktis: 300 nama per roda.
