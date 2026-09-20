export const PRODUCT_FEATURE_TRUTH=Object.freeze({
  marketplace:Object.freeze({
    key:"marketplace",
    status:"preview",
    navLabel:"المتاجر · قريبًا",
    eyebrow:"قريبًا في مربوعة",
    title:"متاجر مربوعة",
    availability:"غير متاح للبيع أو الدفع حاليًا"
  }),
  passkeys:Object.freeze({key:"passkeys",status:"future"}),
  advancedCommerce:Object.freeze({key:"advanced-commerce",status:"future"})
});

export function featureTruth(key){return PRODUCT_FEATURE_TRUTH[key]||null}
