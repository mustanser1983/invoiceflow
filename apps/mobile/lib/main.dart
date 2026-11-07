import 'package:flutter/material.dart';

import 'app.dart';
import 'core/app_config.dart';

void main() {
  runApp(InvoiceflowApp(config: AppConfig.fromEnvironment()));
}
