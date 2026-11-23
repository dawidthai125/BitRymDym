# Słownik rymów — dane

`words.json`: ~43 tys. najczęstszych polskich słów (kolejność częstości).

- Częstość: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave, OpenSubtitles), treść na licencji **CC BY-SA 4.0** — `words.json` jako utwór zależny jest udostępniany na tej samej licencji.
- Filtr słów polskich: [SJP.PL](https://sjp.pl/sl/odmiany/) (odm.txt), licencje GPL 2 / LGPL 2.1 / Apache 2.0 / **CC BY 4.0**.

Przebudowa: `node scripts/build-rymy-words.mjs pl_50k.txt odm.txt`. Podpis źródeł jest na każdej stronie `/rymy`.
