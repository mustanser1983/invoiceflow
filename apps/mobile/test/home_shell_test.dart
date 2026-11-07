import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:invoiceflow/app.dart';
import 'package:invoiceflow/core/app_config.dart';

void main() {
  testWidgets('shows the five bottom navigation sections and switches tabs', (tester) async {
    await tester.pumpWidget(
      const InvoiceflowApp(
        config: AppConfig(environment: AppEnvironment.dev, apiBaseUrl: 'http://localhost'),
      ),
    );
    await tester.pumpAndSettle();

    for (final label in ['Home', 'Sales', 'Purchases', 'Banking', 'More']) {
      expect(find.widgetWithText(NavigationDestination, label), findsOneWidget);
    }
    expect(find.widgetWithText(AppBar, 'Home'), findsOneWidget);

    await tester.tap(find.widgetWithText(NavigationDestination, 'Sales'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Sales'), findsOneWidget);
  });

  testWidgets('hides the environment label in production', (tester) async {
    await tester.pumpWidget(
      const InvoiceflowApp(
        config: AppConfig(environment: AppEnvironment.prod, apiBaseUrl: 'https://api'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Environment:'), findsNothing);
  });
}
