import { IsString, IsNotEmpty, IsUrl, IsIn, MinLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  @IsNotEmpty({ message: 'Base URL is required' })
  @IsUrl({}, { message: 'Base URL must be a valid URL' })
  baseUrl!: string;

  @IsString()
  @IsNotEmpty({ message: 'API Key is required' })
  @MinLength(4, { message: 'API Key must be at least 4 characters' })
  apiKey!: string;

  @IsString()
  @IsIn(['chat-completions', 'anthropic', 'custom'], { message: 'Invalid chat schema' })
  chatSchema!: string;
}
