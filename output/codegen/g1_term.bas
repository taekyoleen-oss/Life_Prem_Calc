Attribute VB_Name = "PremiaFlow"
' PremiaFlow 자동 생성 VBA — 시트: 탭 1
' 동일 파이프라인은 항상 동일한 코드를 생성합니다 (결정론 템플릿, LLM 미사용).
' 실행: 표준 모듈로 가져온 뒤 PremiaFlow_Calc 실행 → 활성 워크시트에 결과 기록.
' 검증: 골든 케이스 수동 스팟 체크 (CI 자동 대사는 Python 스크립트가 담당).
Option Explicit

Sub PremiaFlow_Calc()
    Dim x As Double
    Dim n As Double
    Dim m As Double
    Dim s As Double
    Dim q1 As Variant
    Dim disc3 As Double, i3 As Long
    Dim v1 As Variant
    Dim v2 As Variant
    Dim t4 As Long
    Dim l1 As Variant
    Dim d1 As Variant
    Dim t5 As Long
    Dim t6 As Long
    Dim pvin1 As Double
    Dim t7 As Long
    Dim pvout1 As Double
    Dim pvin8 As Double, pvout8 As Double
    Dim p_annual As Double
    Dim nsp As Double
    Dim f1 As Variant
    Dim ws As Worksheet, r As Long, c As Long

    ' === M01 상품 기본정보 ===

    ' === M02 계약조건 ===
    x = 40: n = 20: m = 20: s = 100000000

    ' === M03 위험률 표 ===
    q1 = Array( _
        0.00207, 0.002212, 0.002366, 0.002534, 0.002717, 0.002916, 0.003134, 0.003371, _
        0.003629, 0.003911, 0.004218, 0.004552, 0.004917, 0.005315, 0.005748, 0.00622, _
        0.006735, 0.007296, 0.007908, 0.008575)  ' q_사망_남

    ' === M04 이자율·현가율 ===
    disc3 = 1 / (1 + 0.025)  ' i = 2.5%
    ReDim tmp3(0 To n) As Double
    tmp3(0) = 1
    For i3 = 1 To n: tmp3(i3) = tmp3(i3 - 1) * disc3: Next i3
    v1 = tmp3
    v2 = v1
    For i3 = 0 To n: v2(i3) = v2(i3) * Sqr(disc3): Next i3  ' 연중

    ' === M05 생존자수·납입자수 ===
    ReDim lv4_0(0 To n) As Double  ' 단일탈퇴
    lv4_0(0) = 100000
    For t4 = 0 To n - 1: lv4_0(t4 + 1) = lv4_0(t4) * (1 - q1(t4)): Next t4
    l1 = lv4_0

    ' === M06 사망자수·발생자수 ===
    ReDim dv5(0 To n - 1) As Double
    For t5 = 0 To n - 1: dv5(t5) = l1(t5) * q1(t5): Next t5  ' d = l·q
    d1 = dv5

    ' === M07 현가합 ===
    pvin1 = 0  ' 수입현가(연시)
    For t6 = 0 To m - 1: pvin1 = pvin1 + l1(t6) * v1(t6): Next t6

    ' === M07 현가합 ===
    pvout1 = 0  ' 지급현가(연말)
    For t7 = 0 To n - 1: pvout1 = pvout1 + s * d1(t7) * v1(t7 + 1): Next t7

    ' === M08 순보험료 ===
    pvin8 = 0
    pvin8 = pvin8 + pvin1
    pvout8 = 0
    pvout8 = pvout8 + pvout1
    p_annual = pvout8 / pvin8  ' 연납 순보험료
    nsp = pvout8 / l1(0)  ' 일시납 순보험료

    ' === M10 사용자 수식 ===
    f1 = PfRoundHU(PfMul(l1, v1), 2)  ' 수식: ROUND(l1 * v1, 2)

    ' === 워크시트 출력 ===
    Set ws = ActiveSheet
    ws.Cells.Clear
    ws.Cells(1, 1).Value = "t"
    ws.Cells(1, 2).Value = "q1"
    For r = LBound(q1) To UBound(q1): ws.Cells(r + 2, 2).Value = q1(r): Next r
    ws.Cells(1, 3).Value = "v1"
    For r = LBound(v1) To UBound(v1): ws.Cells(r + 2, 3).Value = v1(r): Next r
    ws.Cells(1, 4).Value = "v2"
    For r = LBound(v2) To UBound(v2): ws.Cells(r + 2, 4).Value = v2(r): Next r
    ws.Cells(1, 5).Value = "l1"
    For r = LBound(l1) To UBound(l1): ws.Cells(r + 2, 5).Value = l1(r): Next r
    ws.Cells(1, 6).Value = "d1"
    For r = LBound(d1) To UBound(d1): ws.Cells(r + 2, 6).Value = d1(r): Next r
    ws.Cells(1, 7).Value = "f1"
    For r = LBound(f1) To UBound(f1): ws.Cells(r + 2, 7).Value = f1(r): Next r
    For r = 0 To 25: ws.Cells(r + 2, 1).Value = r: Next r
    ws.Cells(1, 9).Value = "스칼라"
    ws.Cells(2, 9).Value = "x"
    ws.Cells(2, 10).Value = x
    ws.Cells(3, 9).Value = "n"
    ws.Cells(3, 10).Value = n
    ws.Cells(4, 9).Value = "m"
    ws.Cells(4, 10).Value = m
    ws.Cells(5, 9).Value = "s"
    ws.Cells(5, 10).Value = s
    ws.Cells(6, 9).Value = "pvin1"
    ws.Cells(6, 10).Value = pvin1
    ws.Cells(7, 9).Value = "pvout1"
    ws.Cells(7, 10).Value = pvout1
    ws.Cells(8, 9).Value = "p_annual"
    ws.Cells(8, 10).Value = p_annual
    ws.Cells(9, 9).Value = "nsp"
    ws.Cells(9, 10).Value = nsp
End Sub

' === 수식(M10) 헬퍼: 계열(Variant 배열)·스칼라 브로드캐스트 ===
Private Function PfIsArr(v As Variant) As Boolean
    PfIsArr = IsArray(v)
End Function

Private Function PfBc(a As Variant, b As Variant, op As String) As Variant
    Dim i As Long, outv() As Variant
    If PfIsArr(a) And PfIsArr(b) Then
        ReDim outv(LBound(a) To UBound(a))
        For i = LBound(a) To UBound(a): outv(i) = PfOp(a(i), b(i), op): Next i
        PfBc = outv
    ElseIf PfIsArr(a) Then
        ReDim outv(LBound(a) To UBound(a))
        For i = LBound(a) To UBound(a): outv(i) = PfOp(a(i), b, op): Next i
        PfBc = outv
    ElseIf PfIsArr(b) Then
        ReDim outv(LBound(b) To UBound(b))
        For i = LBound(b) To UBound(b): outv(i) = PfOp(a, b(i), op): Next i
        PfBc = outv
    Else
        PfBc = PfOp(a, b, op)
    End If
End Function

Private Function PfOp(x As Variant, y As Variant, op As String) As Variant
    Select Case op
        Case "+": PfOp = x + y
        Case "-": PfOp = x - y
        Case "*": PfOp = x * y
        Case "/": PfOp = x / y
        Case "^": PfOp = x ^ y
        Case "=": PfOp = IIf(x = y, 1#, 0#)
        Case "<>": PfOp = IIf(x <> y, 1#, 0#)
        Case "<": PfOp = IIf(x < y, 1#, 0#)
        Case "<=": PfOp = IIf(x <= y, 1#, 0#)
        Case ">": PfOp = IIf(x > y, 1#, 0#)
        Case ">=": PfOp = IIf(x >= y, 1#, 0#)
        Case "min": PfOp = IIf(x < y, x, y)
        Case "max": PfOp = IIf(x > y, x, y)
        Case "rhu": PfOp = IIf(x < 0, -Int(-x * y + 0.5), Int(x * y + 0.5)) / y
        Case "flr": PfOp = Int(x * y) / y
        Case "cel": PfOp = -Int(-(x * y)) / y
    End Select
End Function

Function PfAdd(a As Variant, b As Variant) As Variant
    PfAdd = PfBc(a, b, "+")
End Function
Function PfSub(a As Variant, b As Variant) As Variant
    PfSub = PfBc(a, b, "-")
End Function
Function PfMul(a As Variant, b As Variant) As Variant
    PfMul = PfBc(a, b, "*")
End Function
Function PfDiv(a As Variant, b As Variant) As Variant
    PfDiv = PfBc(a, b, "/")
End Function
Function PfPow(a As Variant, b As Variant) As Variant
    PfPow = PfBc(a, b, "^")
End Function
Function PfEq(a As Variant, b As Variant) As Variant
    PfEq = PfBc(a, b, "=")
End Function
Function PfNe(a As Variant, b As Variant) As Variant
    PfNe = PfBc(a, b, "<>")
End Function
Function PfLt(a As Variant, b As Variant) As Variant
    PfLt = PfBc(a, b, "<")
End Function
Function PfLe(a As Variant, b As Variant) As Variant
    PfLe = PfBc(a, b, "<=")
End Function
Function PfGt(a As Variant, b As Variant) As Variant
    PfGt = PfBc(a, b, ">")
End Function
Function PfGe(a As Variant, b As Variant) As Variant
    PfGe = PfBc(a, b, ">=")
End Function
Function PfMin2(a As Variant, b As Variant) As Variant
    PfMin2 = PfBc(a, b, "min")
End Function
Function PfMax2(a As Variant, b As Variant) As Variant
    PfMax2 = PfBc(a, b, "max")
End Function

Function PfNeg(a As Variant) As Variant
    PfNeg = PfBc(0#, a, "-")
End Function

Function PfSum(s As Variant) As Variant
    If Not IsArray(s) Then PfSum = s: Exit Function
    Dim i As Long, acc As Double
    acc = 0
    For i = LBound(s) To UBound(s): acc = acc + s(i): Next i
    PfSum = acc
End Function

Function PfCumSum(s As Variant) As Variant
    Dim i As Long, acc As Double, outv() As Variant
    ReDim outv(LBound(s) To UBound(s))
    acc = 0
    For i = LBound(s) To UBound(s): acc = acc + s(i): outv(i) = acc: Next i
    PfCumSum = outv
End Function

Function PfShift(s As Variant, k As Variant) As Variant
    Dim i As Long, outv() As Variant
    ReDim outv(LBound(s) To UBound(s))
    For i = LBound(s) To UBound(s)
        If i - k >= LBound(s) And i - k <= UBound(s) Then outv(i) = s(i - k) Else outv(i) = 0
    Next i
    PfShift = outv
End Function

Function PfRoundHU(x As Variant, d As Variant) As Variant
    PfRoundHU = PfBc(x, 10 ^ d, "rhu")
End Function
' 반올림(half-up)·절사·올림은 자릿수 스칼라 전제
Function PfFloorD(x As Variant, d As Variant) As Variant
    PfFloorD = PfBc(x, 10 ^ d, "flr")
End Function
Function PfCeilD(x As Variant, d As Variant) As Variant
    PfCeilD = PfBc(x, 10 ^ d, "cel")
End Function

Function PfIf(c As Variant, a As Variant, b As Variant) As Variant
    Dim i As Long, outv() As Variant
    If Not IsArray(c) And Not IsArray(a) And Not IsArray(b) Then
        PfIf = IIf(c <> 0, a, b): Exit Function
    End If
    Dim ref As Variant
    If IsArray(c) Then ref = c ElseIf IsArray(a) Then ref = a Else ref = b
    ReDim outv(LBound(ref) To UBound(ref))
    For i = LBound(ref) To UBound(ref)
        outv(i) = IIf(PfAt(c, i) <> 0, PfAt(a, i), PfAt(b, i))
    Next i
    PfIf = outv
End Function

Private Function PfAt(v As Variant, i As Long) As Variant
    If IsArray(v) Then PfAt = v(i) Else PfAt = v
End Function
