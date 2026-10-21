import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ExportDataScreen from '../../../app/backup/export';
import {
  requestAndDownloadDataExport,
  shareExportFile,
  DataExportTimeoutError,
} from '../../../utils/dataExportFlow';

jest.mock('../../../utils/dataExportFlow');

describe('ExportDataScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('wires the export button to the real data-export flow and shares the result', async () => {
    (requestAndDownloadDataExport as jest.Mock).mockImplementation(async (onPhaseChange) => {
      onPhaseChange?.('requesting');
      onPhaseChange?.('processing');
      onPhaseChange?.('downloading');
      onPhaseChange?.('done');
      return { exportId: 'export-123', fileUri: 'file:///mock-cache/export.json' };
    });
    (shareExportFile as jest.Mock).mockResolvedValue(undefined);

    const { getByText } = render(<ExportDataScreen />);

    await act(async () => {
      fireEvent.press(getByText('JSON'));
    });

    await waitFor(() => {
      expect(requestAndDownloadDataExport).toHaveBeenCalledTimes(1);
    });
    expect(shareExportFile).toHaveBeenCalledWith('file:///mock-cache/export.json');
    expect(getByText('Your data export is ready.')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows a user-visible error instead of failing silently when the export request fails', async () => {
    (requestAndDownloadDataExport as jest.Mock).mockRejectedValue(
      new Error('Network request failed')
    );

    const { getByText } = render(<ExportDataScreen />);

    await act(async () => {
      fireEvent.press(getByText('JSON'));
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Export Failed', 'Network request failed');
    });
    expect(shareExportFile).not.toHaveBeenCalled();
  });

  it('shows a friendly timeout message when the export never becomes ready', async () => {
    (requestAndDownloadDataExport as jest.Mock).mockRejectedValue(
      new DataExportTimeoutError('export-slow')
    );

    const { getByText } = render(<ExportDataScreen />);

    await act(async () => {
      fireEvent.press(getByText('JSON'));
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Export Failed',
        'Still preparing your export. Please check back in a few minutes.'
      );
    });
  });

  it('tells the user the export downloaded even if sharing it fails', async () => {
    (requestAndDownloadDataExport as jest.Mock).mockResolvedValue({
      exportId: 'export-123',
      fileUri: 'file:///mock-cache/export.json',
    });
    (shareExportFile as jest.Mock).mockRejectedValue(new Error('Share sheet unavailable'));

    const { getByText } = render(<ExportDataScreen />);

    await act(async () => {
      fireEvent.press(getByText('JSON'));
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Export Downloaded',
        'Your data export was downloaded but could not be opened for sharing. It is saved in app storage.'
      );
    });
  });
});
