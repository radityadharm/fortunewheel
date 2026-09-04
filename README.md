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
| **Dua roda** | Ganti ke mode *2 Roda* untuk menjalankan roda kedua dengan isi berbeda (mis. peserta × hadiah). Bisa diputar sendiri-sendiri atau bareng lewat **Putar semua**. Kartu hasil selalu menampilkan pemenang terakhir dari **kedua** roda — memutar roda 2 tidak menghapus pemenang roda 1 — dan yang baru saja diundi diberi tanda *baru saja*. |
| **Layar peserta** | Halaman `slide.html` untuk diproyeksikan ke layar besar: daftar peserta berukuran besar, status *sedang mengundi*, pengumuman pemenang layar penuh dengan confetti, dan daftar pemenang sejauh ini. Mengikuti halaman roda secara langsung di browser yang sama. |
| **Riwayat** | Daftar pemenang per roda beserta jamnya. |
| **Tersimpan otomatis** | Semua isi roda, mode, dan pengaturan disimpan di `localStorage` browser. |

Pelengkap: acak urutan, ganti nama roda, matikan suara, tekan <kbd>Spasi</kbd>
untuk memutar roda aktif, <kbd>Esc</kbd> untuk menutup dialog, dan tampilan
menyesuaikan layar ponsel.

## Layar peserta (halaman slide)

Klik **Layar peserta** di kanan atas — `slide.html` terbuka di tab baru. Pindahkan
tab itu ke layar/proyektor kedua, lalu jalankan undian seperti biasa di halaman
roda. Layar peserta ikut berubah sendiri: nama bertambah/berkurang, tanda *tidak
diundi*, status saat roda berputar, dan pengumuman pemenang berukuran besar.

Sinkronisasinya lewat `BroadcastChannel` + `localStorage`, jadi berlaku untuk
tab/jendela lain **di browser yang sama** — cukup untuk laptop yang disambungkan
ke proyektor. Untuk tampil di perangkat lain (mis. dari komputer berbeda),
dibutuhkan penyimpanan bersama di server.

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

Karena semua data disimpan di `localStorage` masing-masing pengunjung, tidak ada
database atau environment variable yang perlu disiapkan.

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
