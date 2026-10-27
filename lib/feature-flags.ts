/**
 * Switches for things that are built but temporarily not shown.
 *
 * PARTICIPANT_PAYMENTS_VISIBLE: payments in the participant's cabinet. While it is false they see no «Оплаты»
 * tab or page, no payment card on «Сегодня», no overdue badge and no «К оплате» notification, and the app does not
 * even load their payments. To bring everything back, set it to true: nothing else has to change.
 * (Only what the participant sees is hidden: staff pages and the data itself are untouched.)
 */
export const PARTICIPANT_PAYMENTS_VISIBLE = false
