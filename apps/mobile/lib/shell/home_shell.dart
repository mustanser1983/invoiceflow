import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../l10n/app_localizations.dart';

/// Bottom-navigation shell: Home, Sales, Purchases, Banking, More (PRD §5).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.config});

  final AppConfig config;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tabs = <({String label, IconData icon, IconData selectedIcon})>[
      (label: l10n.navHome, icon: Icons.home_outlined, selectedIcon: Icons.home),
      (label: l10n.navSales, icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long),
      (
        label: l10n.navPurchases,
        icon: Icons.shopping_bag_outlined,
        selectedIcon: Icons.shopping_bag,
      ),
      (
        label: l10n.navBanking,
        icon: Icons.account_balance_outlined,
        selectedIcon: Icons.account_balance,
      ),
      (label: l10n.navMore, icon: Icons.menu, selectedIcon: Icons.menu_open),
    ];
    final current = tabs[_index];

    return Scaffold(
      appBar: AppBar(title: Text(current.label)),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(current.selectedIcon, size: 48),
            const SizedBox(height: 12),
            Text(l10n.comingSoon, style: Theme.of(context).textTheme.titleMedium),
            if (!widget.config.isProduction) ...[
              const SizedBox(height: 8),
              Text(
                l10n.environmentLabel(widget.config.environment.name),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selectedIcon),
              label: t.label,
            ),
        ],
      ),
    );
  }
}
