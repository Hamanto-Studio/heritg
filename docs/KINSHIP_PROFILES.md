# Relationship language profiles

Heritg's regional relationship profiles are kinship resolvers, not translated word lists. They
use the selected person as ego and apply a customary term only when the family graph proves the
required gender, seniority, lineage side, and relationship path. Unsupported or ambiguous modern
relationships retain an explicit Indonesian label rather than receiving a fabricated term.

## Profile identifiers

- `jv-cirebon`: Basa Cerbon, Cirebon
- `su-priangan`: standard/Priangan Sundanese (`basa Sunda lulugu`)
- `bbc-toba`: Batak Toba
- `btx-karo`: Batak Karo
- `btm-mandailing`: Batak Mandailing
- `akb-angkola`: Batak Angkola
- `bts-simalungun`: Batak Simalungun
- `btd-pakpak`: Pakpak/Dairi

Batak is not one selectable terminology. The six Batak profiles remain independent even where
they contain cognate terms. Heritg does not infer marga, wife-giver/wife-taker categories,
marriageability, or ceremonial roles from genealogy alone.

## Resolver guardrails

- Explicit relationship subtypes are resolved before customary biological terms.
- Sibling seniority uses manual birth order first, then comparable birth dates. It is never
  inferred from insertion order, IDs, names, or gender.
- Parent-sibling, niece/nephew, and cousin terms require a biological path. Adoptive paths use a
  descriptive fallback unless the profile has a directly supported adoptive term.
- `Pariban`, `Impal`, `Botou banua`, `Anak namboru`, and `Boru tulang` are emitted only for their
  supported cross-cousin paths, never for every first cousin.
- Sundanese `Ua`, `Paman`/`Bibi`, `Alo`, `Suan`, `Kapilanceuk`, and `Kapiadi` depend on seniority
  at the correct connecting generation.
- Cirebon `Uwa` versus `Mamang`/`Bibi` also depends on the connecting parent's sibling order.
- Ordinary cross-platform `.heritg` archives do not persist this app preference. JSON backups
  and encrypted Web share snapshots do.

## Primary references

### Basa Cerbon

- Ministry of Education and Culture, *Kamus Bahasa Cirebon-Indonesia* (1992):
  https://repositori.kemendikdasmen.go.id/26271/
- West Java Education Office, *Blajar Basa lan Sastra Cerbon-Dermayu Kanggé Murid SD/MI Kelas VI*:
  https://www.didno76.com/2020/07/buku-siswa-bahasa-indramayu-dan-cirebon_24.html
- Glottolog, Cirebonese: https://glottolog.org/resource/languoid/id/cire1240

### Basa Sunda

- Retty Isnendes, "Terms of Kinship in the Sundanese Society":
  https://doi.org/10.2991/assehr.k.210427.070
- SundaDigi/Pusat Budaya Sunda, "Pancakaki": https://sundadigi.com/materi/detail/90
- Dede Mulyanto, "Sundanese Kinship Terminology in an Old Sundanese Manuscript":
  https://doi.org/10.15294/komunitas.v11i2.19089

### Batak Toba

- J. C. Vergouwen, *The Social Organisation and Customary Law of the Toba-Batak of Northern
  Sumatra*, kinship chapter: https://doi.org/10.1007/978-94-015-1035-6_3
- Anggur P. Tambunan, *Kamus Bahasa Batak Toba-Indonesia*:
  https://openlibrary.org/books/OL4394838M

### Batak Karo

- Masri Singarimbun, *Kinship, Descent and Alliance among the Karo Batak*, Appendix II:
  https://doi.org/10.1525/9780520309838-018
- Ahmad Samin Siregar et al., *Kamus Karo-Indonesia*:
  https://openlibrary.org/books/OL2366650M

### Mandailing and Angkola

- Rosliana Lubis, "Partuturon dalam Masyarakat Angkola":
  https://web.archive.org/web/20101231221020id_/http://repository.usu.ac.id/bitstream/123456789/15557/1/log-apr2006-%20%284%29.pdf
- Husniah Ramadhani Pulungan, "Mencegah Terjadinya Pernikahan Sedarah dengan Memahami
  Partuturon dalam Masyarakat Batak Angkola-Mandailing": https://doi.org/10.24952/fitrah.v1i2.321
- Abbas Pulungan, *Dalihan Na Tolu*:
  https://archive.org/details/abbas-pulungan-dalihan-na-tolu-2018

### Batak Simalungun

- Balai Bahasa Provinsi Sumatera Utara, *Kamus Simalungun-Indonesia* (2021):
  https://repositori.kemendikdasmen.go.id/34742/
- Gunawan Purba, "Pergeseran Kata Sapaan dalam Bahasa Simalungun":
  https://doi.org/10.24114/bss.v6i4.9027
- Henry Guntur Tarigan, *Sitalasari: Bunga Rampai Adat dan Budaya Simalungun*:
  https://repositori.kemendikdasmen.go.id/14526/

### Pakpak/Dairi

- A. C. Viner, "Pakpak adat and kinship terminology":
  https://doi.org/10.1163/22134379-90003513
- Clara Brakel-Papenhuyzen, *Dairi Stories and Pakpak Storytelling*:
  https://books.google.com/books?id=ypOfAwAAQBAJ
- Tindi Radja Manik, *Kamus Pakpak-Indonesia*:
  https://openlibrary.org/books/OL3742551M/Kamus_Pakpak-Indonesia
- Lister Berutu and Juniar Banurea, *Pertuturen Pakpak*:
  https://openlibrary.org/books/OL16956752M/Pertuturen_Pakpak

These profiles are conservative software mappings. Expansion into marga- or adat-dependent roles
requires explicit model data and review by fluent cultural practitioners for the relevant profile.
