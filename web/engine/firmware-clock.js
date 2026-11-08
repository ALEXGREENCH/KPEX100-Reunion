// Catalogued ROMs observed programming the TCC76x FCLK registers during boot.
const supported = new Set([
  '6f4cfa569d070e9d4167a7e8ab2aae9d65f31f5407ce761e32f3199e7013f0c8', // Cenix 1.00
  '72ba8bfd80fbc669b678a5cdfaf9c5dc43722e4c2f01f0bfaf90e793dfef78f8', // Cenix 1.02
  'e4ca76f5909bb20ca0d0ae8b680698ee912b143eeb7a5c8a262d577a7b734cdc', // Cenix 2.00
  'efe2e8215dc123f1e0a9c1257461d7d30f376184711ddf9fde17ba6929370643', // Cenix 2.01
  '15f49a0aa6d15ae07d39b9cf32aca0f41e8bdd598fb09726026640654465a282', // Cenix 2.10
  '8ba987031c28ebc51c202c3c809bd607c746c6529472e067382ef940aa1c1407', // Cenix 2.20
  '4c3a8b1ca0282e23ae7696857a919842732e71d0bbccb093c41a0746435b40c2', // Cenix 2.21
  '4c66faa7dd686fc4df20e9e6249953c97a975b2df3a3455764c99dc0afe21b40', // Kingston 2.09
  '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a', // Kingston 2.12
]);

export function hasNominalClock(romSha256) {
  return supported.has(romSha256);
}
