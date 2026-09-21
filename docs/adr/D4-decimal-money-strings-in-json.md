# D4: Decimal money; amounts cross JSON as strings

**Status:** accepted

`money(x) = Decimal(str(x)).quantize(0.01, ROUND_HALF_UP)`. Never
`Decimal(float)`. Amounts serialise as strings ("1000.00") so no consumer
re-parses them into floats silently.

**Why.** Float rounding produces wrong fils and irreproducible results; a
wage answer that differs by run is indefensible in a dispute.
