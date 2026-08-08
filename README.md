# SatSet

**Marketplace API micropayment onchain — bayar per-request pakai x402 di Monad.**

🔗 **Live demo:** _(belum di-deploy ke Vercel — coming soon)_

Dibuat untuk **Monad Blitz Hackathon**.

---

## Cara main

1. Buka halaman utama (`/`) — dashboard provider: daftar endpoint, harga, total calls, total revenue, dan live feed pembayaran onchain (event `CallPaid`) yang update realtime tanpa refresh.
2. Buka `/agent` — masukkan teks/simbol apa saja, klik **Run agent**. Agent akan memanggil ketiga endpoint berbayar secara berurutan, bayar otomatis pakai x402 (tanpa popup wallet, tanpa konfirmasi manual), dan menampilkan log tiap langkah: `request → 402 → paying → 200`, lengkap dengan tx hash yang bisa diklik ke explorer.
3. Balik ke dashboard (`/`) — call yang baru saja dibayar agent langsung muncul di live feed dan tabel endpoint, real time.

### Endpoint yang tersedia

| Endpoint | Harga | Fungsi |
|---|---|---|
| `POST /api/summarize` | $0.001 | Ambil 2 kalimat pertama dari `text` |
| `POST /api/sentiment` | $0.001 | Skor sentimen (positive/negative/neutral) dari `text` |
| `POST /api/price` | $0.002 | Quote harga deterministik untuk `symbol` |

Semua endpoint diproteksi [x402](https://docs.monad.xyz/guides/x402) scheme `exact` — request tanpa pembayaran akan dibalas `402 Payment Required`.

## Contract

Onchain registry (`ApiRegistry.sol`) mencatat endpoint, harga, dan jumlah call — dipakai dashboard buat baca data & live feed.

- **Address:** `0x343676948a62279c5a44d33e545dac90d467a0cf`
- **Explorer:** https://testnet.monadexplorer.com/address/0x343676948a62279c5a44d33e545dac90d467a0cf
- **Network:** Monad Testnet (chain id `10143`)

## Kenapa butuh Monad?

Micropayment cuma masuk akal kalau biaya settlement-nya jauh lebih kecil dari nilai yang dibayar. Di sebagian besar L1, gas fee buat satu transaksi bisa lebih mahal dari harga API-nya sendiri ($0.001) — micropayment jadi gak ekonomis, dan waktu block yang lambat bikin "bayar dulu baru dapat respons" terasa lambat buat API real-time.

Monad adalah L1 EVM-compatible yang didesain buat throughput tinggi dan latency rendah lewat eksekusi paralel, dengan gas fee yang sangat murah — cukup murah buat settlement onchain per-request tetap masuk akal meski harganya sub-cent. Karena tetap EVM-compatible, seluruh tooling yang dipakai di sini (viem, Solidity, x402) langsung jalan tanpa perlu adaptasi khusus. Kombinasi ini yang bikin pola "bayar $0.001 per call, settle onchain, tiap call" praktis dijalankan — sesuatu yang sulit dilakukan di chain dengan gas mahal atau block time lambat.

## Cara jalanin lokal

```bash
npm install
cp .env.local.example .env.local
# isi .env.local:
#   PAY_TO_ADDRESS  = wallet penerima pembayaran
#   PRIVATE_KEY     = private key wallet yang sama (dipakai deploy, recorder, dan agent payer)
#   -> wallet ini butuh testnet USDC buat bisa bayar (faucet.circle.com, pilih Monad Testnet)
#   -> dan testnet MON buat gas deploy (faucet.monad.xyz)

npm run dev
# buka http://localhost:3000
```

Redeploy contract (opsional — contract yang sudah ada di atas sudah bisa langsung dipakai):

```bash
npm run deploy
```

Stack: Next.js (TypeScript, Tailwind, App Router) · viem · Solidity · [x402](https://docs.monad.xyz/guides/x402) · Monad Testnet.

## Tim

- Muhammad Syamil Alfarizi
- Raka Pramasurya Zuhri
