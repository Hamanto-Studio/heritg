const asset = (name: string) => `/payment-methods/${name}.png`;

export function PaymentMethodLogos({ cardLabel }: { cardLabel: string }) {
  return (
    <div className="indonesian-payment-methods">
      <span className="payment-logo" title="GoPay"><img alt="GoPay" src={asset("gopay")} /></span>
      <span className="payment-logo" title="DANA"><img alt="DANA" src={asset("dana")} /></span>
      <span className="payment-logo" title="OVO"><img alt="OVO" src={asset("ovo")} /></span>
      <span className="payment-logo" title="ShopeePay"><img alt="ShopeePay" src={asset("shopeepay")} /></span>
      <span className="payment-logo" title="BRI Direct Debit"><img alt="BRI Direct Debit" src={asset("bri")} /></span>
      <span className="payment-logo payment-logo-cards" title={cardLabel}>
        <img alt="Visa" src={asset("visa")} />
        <img alt="Mastercard" src={asset("mastercard")} />
      </span>
    </div>
  );
}
