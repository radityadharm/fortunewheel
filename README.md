# 🎡 Fortune Wheel — Undian Nama

Aplikasi roda undian: masukkan nama, putar rodanya, dan pemenangnya dirayakan
dengan confetti. Bisa menyimpan beberapa roda untuk dipakai lagi, dan bisa
menjalankan **dua roda sekaligus** dengan isi yang berbeda.

Situs statis murni — tanpa framework, tanpa dependency, tanpa proses build.

## Fitur

| Fitur | Keterangan |
| --- | --- |
| **Input nama** | Satu per satu (Enter) atau sekaligus lewat tempel banyak baris/koma. Nama kembar otomatis ditolak. |
| **Confetti** | Ledakan confetti + suara singkat tiap kali pemenang keluar. Di mode dua roda, confetti dikurung di kolom rodanya masing-masing sehingga perayaan roda kiri dan kanan terpisah. |
| **Hapus pemenang** | Tombol *Hapus dari roda* di kartu pemenang agar tidak menang dua kali — lengkap dengan tombol *Kembalikan* kalau salah pencet. |
| **Tampil tapi tidak diundi** | Untuk peserta yang sudah sering menang: namanya **tetap tampil di roda** (segmen abu-abu bergaris) tapi tidak akan pernah terpilih. Atur lewat tombol ⊘ di daftar nama atau tombol *Tidak ikut lagi* di kartu pemenang. Bisa dibatalkan satu per satu, atau sekaligus lewat **ikutkan semua lagi**. |
| **Setelah menang** | Satu pilihan per roda: pemenang *tetap di roda*, *hapus dari roda*, atau *tidak ikut lagi* secara otomatis. |
| **Roda tersimpan** | Simpan daftar nama dengan sebuah nama roda, lalu muat lagi kapan saja — status *tidak diundi* ikut tersimpan. Bisa ditimpa, diduplikat, dihapus, diekspor/impor JSON. |
| **Database (opsional)** | Kalau Upstash Redis dipasang di Vercel, roda tersimpan naik ke database sehingga bisa dibuka dari perangkat lain dan tidak hilang saat data browser dibersihkan. Membaca terbuka; menyimpan/menghapus perlu **kode admin**. Tanpa database, aplikasi tetap jalan penuh dengan penyimpanan browser. |
| **Dua roda** | Ganti ke mode *2 Roda* untuk menjalankan roda kedua dengan isi berbeda (mis. peserta × hadiah). Bisa diputar sendiri-sendiri atau bareng lewat **Putar semua**. Kartu hasil selalu menampilkan pemenang terakhir dari **kedua** roda — memutar roda 2 tidak menghapus pemenang roda 1 — dan yang baru saja diundi diberi tanda *baru saja*. |
| **Layar peserta** | Halaman `slide.html` untuk diproyeksikan ke layar besar: **rodanya ikut berputar** mengikuti moderator, daftar peserta berukuran besar, pengumuman pemenang layar penuh dengan confetti, dan daftar pemenang sejauh ini. Bisa dibuka di tab lain pada browser yang sama, atau **di perangkat lain lewat tautan peserta** kalau database aktif. Dengan dua roda, papannya ditumpuk atas–bawah dan confetti tiap roda tinggal di pitanya sendiri. |
| **Riwayat** | Daftar pemenang per roda beserta jamnya. |
| **Tersimpan otomatis** | Semua isi roda, mode, dan pengaturan disimpan di `localStorage` browser. |

Pelengkap: acak urutan, ganti nama roda, matikan suara, tekan <kbd>Spasi</kbd>
untuk memutar roda aktif, <kbd>Esc</kbd> untuk menutup dialog, dan tampilan
menyesuaikan layar ponsel.

## Layar peserta (halaman slide)

Layar untuk penonton: roda besar yang ikut berputar, daftar peserta, dan
pengumuman pemenang. Ada dua cara membukanya.

**Di perangkat yang sama** — klik **Layar peserta** di kanan atas (atau buka
`slide.html`). Tab itu mengikuti halaman roda lewat `BroadcastChannel` +
`localStorage`, cocok untuk laptop yang dicolok ke proyektor. Tidak perlu
database.

**Di perangkat lain** — butuh database yang aktif (lihat bagian berikutnya):

1. Buka **Roda tersimpan**, masukkan kode admin.
2. Di kotak **Layar peserta**, klik **Buat tautan peserta**, lalu salin
   tautannya (bentuknya `…/slide.html?s=xxxxxxxxxxxx`).
3. Buka tautan itu di komputer/TV/tablet mana pun.

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
pernah bisa berhenti di jarum.

Batas praktis: 300 nama per roda.
