import { IsNotEmpty, IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsNotEmpty()
  @IsString()
  otherUserId: string;

  @IsOptional()
  @IsString()
  initialMessage?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}

export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  @MinLength(1)
  message: string;
}
